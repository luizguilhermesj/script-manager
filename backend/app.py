import os
import re
import signal
import gevent
from gevent import subprocess
import threading
import sqlite3
import json
from flask import Flask, jsonify, request, g
from flask_cors import CORS
from flask_socketio import SocketIO

app = Flask(__name__)
CORS(app)
# Use gevent for async operations
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='gevent')

DATABASE = 'commands.db'

# --- Database Functions ---
def get_db():
    db = getattr(g, '_database', None)
    if db is None:
        db = g._database = sqlite3.connect(DATABASE)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    with app.app_context():
        db = get_db()
        with app.open_resource('schema.sql', mode='r') as f:
            db.cursor().executescript(f.read())
        db.commit()

def query_db(query, args=(), one=False):
    cur = get_db().execute(query, args)
    rv = cur.fetchall()
    cur.close()
    return (rv[0] if rv else None) if one else rv

def execute_db(query, args=()):
    db = get_db()
    db.execute(query, args)
    db.commit()

# --- In-memory data store for runtime processes ---
processes = {}

def process_monitor_thread(command_id, proc):
    """Monitors a command, streams its output, and handles termination using gevent."""
    stdout_lines = []
    stderr_lines = []

    def stream_reader(stream, lines, stream_name):
        try:
            for line in iter(stream.readline, ''):
                stripped_line = line.strip()
                lines.append(stripped_line)
                # Use socketio.sleep to yield control and prevent blocking
                socketio.sleep(0) 
                socketio.emit(stream_name, {'command_id': command_id, 'output': stripped_line})
            stream.close()
        except Exception as e:
            # Handle potential exceptions on stream read
            print(f"Error reading stream {stream_name} for command {command_id}: {e}")


    # Use gevent.spawn to run stream readers concurrently without blocking
    stdout_greenlet = gevent.spawn(stream_reader, proc.stdout, stdout_lines, 'stdout')
    stderr_greenlet = gevent.spawn(stream_reader, proc.stderr, stderr_lines, 'stderr')

    # Wait for the process to complete without blocking the server
    return_code = proc.wait()
    
    # Wait for the stream readers to finish
    gevent.joinall([stdout_greenlet, stderr_greenlet], timeout=1)

    with app.app_context():
        command_row = query_db('SELECT * FROM commands WHERE id = ?', [command_id], one=True)
        if command_row:
            command_def = json.loads(command_row['data'])
            
            final_status = 'error'
            if proc.returncode == 0:
                final_status = 'success'
            elif proc.returncode < 0:
                final_status = 'stopped'
            
            # Update the full definition for the database for persistence
            command_def['status'] = final_status
            command_def['returnCode'] = proc.returncode
            command_def['output'] = command_def.get('output', []) + stdout_lines
            command_def['errorOutput'] = command_def.get('errorOutput', []) + stderr_lines
            execute_db('UPDATE commands SET data = ? WHERE id = ?', [json.dumps(command_def), command_id])
            
            # Emit a smaller, status-only update to the frontend
            socketio.emit('status_update', {
                'id': command_id,
                'status': final_status,
                'returnCode': proc.returncode
            })
            
    if command_id in processes:
        del processes[command_id]

@app.route('/commands', methods=['POST'])
def create_command():
    data = request.get_json()
    command_id = data.get('id', str(len(query_db('SELECT * FROM commands')) + 1))
    data['id'] = command_id
    execute_db('INSERT INTO commands (id, data) VALUES (?, ?)', [command_id, json.dumps(data)])
    socketio.emit('command_added', data)
    return jsonify(data), 201

@app.route('/commands', methods=['GET'])
def get_commands():
    db_commands = query_db('SELECT * FROM commands')
    command_list = [json.loads(item['data']) for item in db_commands]
    return jsonify(command_list)

@app.route('/commands/<command_id>/run', methods=['POST'])
def run_command(command_id):
    command_row = query_db('SELECT * FROM commands WHERE id = ?', [command_id], one=True)
    if not command_row:
        return jsonify({'error': 'Command not found'}), 404
    
    command_def = json.loads(command_row['data'])

    if command_id in processes and processes[command_id].poll() is None:
        return jsonify({'error': 'Command is already running'}), 400

    executable = command_def.get('executable', '')
    arguments = command_def.get('arguments', [])
    generated_args = []
    
    for arg in arguments:
        if not arg.get('enabled'): continue
        
        final_value = arg.get('value', '')
        arg_name = arg.get('name', '')

        if arg.get('type') == 'variable':
            source_command_id = arg.get('sourceCommandId')
            if not source_command_id:
                error_msg = f"Argument '{arg_name}' is missing a source command."
                command_def['status'] = 'error'; command_def['errorOutput'] = [error_msg]
                execute_db('UPDATE commands SET data = ? WHERE id = ?', [json.dumps(command_def), command_id])
                socketio.emit('status_update', command_def)
                return jsonify({'error': error_msg}), 400

            source_command_row = query_db('SELECT * FROM commands WHERE id = ?', [source_command_id], one=True)
            if not source_command_row:
                error_msg = f"Source command with ID '{source_command_id}' not found."
                command_def['status'] = 'error'; command_def['errorOutput'] = [error_msg]
                execute_db('UPDATE commands SET data = ? WHERE id = ?', [json.dumps(command_def), command_id])
                socketio.emit('status_update', command_def)
                return jsonify({'error': error_msg}), 400
            
            source_command_def = json.loads(source_command_row['data'])
            source_command_name = source_command_def.get('name', 'Unknown')
            
            if source_command_def.get('status') != 'success':
                error_msg = f"Dependency '{source_command_name}' has not run successfully."
                command_def['status'] = 'error'; command_def['errorOutput'] = [error_msg]
                execute_db('UPDATE commands SET data = ? WHERE id = ?', [json.dumps(command_def), command_id])
                socketio.emit('status_update', command_def)
                return jsonify({'error': error_msg}), 400

            regex_pattern = arg.get('regex')
            if not regex_pattern:
                error_msg = f"Argument '{arg_name}' is missing a regex pattern."
                command_def['status'] = 'error'; command_def['errorOutput'] = [error_msg]
                execute_db('UPDATE commands SET data = ? WHERE id = ?', [json.dumps(command_def), command_id])
                socketio.emit('status_update', command_def)
                return jsonify({'error': error_msg}), 400

            full_output = '\n'.join(source_command_def.get('output', []))
            
            try:
                match = re.search(regex_pattern, full_output)
                if match:
                    final_value = match.group(1) if len(match.groups()) > 0 else match.group(0)
                else:
                    error_msg = f"Regex did not find a match in the output of '{source_command_name}'."
                    command_def['status'] = 'error'; command_def['errorOutput'] = [error_msg]
                    execute_db('UPDATE commands SET data = ? WHERE id = ?', [json.dumps(command_def), command_id])
                    socketio.emit('status_update', command_def)
                    return jsonify({'error': error_msg}), 400
            except re.error as e:
                error_msg = f"Invalid regex for argument '{arg_name}': {e}"
                command_def['status'] = 'error'; command_def['errorOutput'] = [error_msg]
                execute_db('UPDATE commands SET data = ? WHERE id = ?', [json.dumps(command_def), command_id])
                socketio.emit('status_update', command_def)
                return jsonify({'error': error_msg}), 400
        
        if arg.get('type') != 'variable' and final_value:
            execute_db('INSERT OR IGNORE INTO argument_history (command_id, argument_name, value) VALUES (?, ?, ?)',
                       [command_id, arg_name, final_value])
        
        is_positional = arg.get('isPositional', False)
        if is_positional:
            if final_value: generated_args.append(f"'{final_value}'")
        else:
            if final_value: generated_args.append(f"{arg_name} '{final_value}'")
            else: generated_args.append(arg_name)

    command_to_run = f"{executable} {' '.join(generated_args)}"
    
    command_def['generatedCommand'] = command_to_run
    command_def['status'] = 'running'
    command_def['output'] = [f"$ {command_to_run}"]
    command_def['errorOutput'] = []
    command_def.pop('returnCode', None)
    execute_db('UPDATE commands SET data = ? WHERE id = ?', [json.dumps(command_def), command_id])
    socketio.emit('status_update', command_def)

    try:
        # Use gevent's Popen for non-blocking subprocess management
        proc = subprocess.Popen(
            command_to_run, shell=True, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, text=True, preexec_fn=os.setsid,
            bufsize=1, universal_newlines=True
        )
        processes[command_id] = proc
        
        socketio.start_background_task(process_monitor_thread, command_id, proc)

        return jsonify(command_def)
    except Exception as e:
        command_def['status'] = 'error'
        command_def['errorOutput'] = [str(e)]
        execute_db('UPDATE commands SET data = ? WHERE id = ?', [json.dumps(command_def), command_id])
        socketio.emit('status_update', command_def)
        return jsonify({'error': str(e)}), 500

@app.route('/commands/<command_id>/arguments/<argument_name>/history', methods=['GET'])
def get_argument_history(command_id, argument_name):
    """Retrieves the last 10 unique values for a given argument of a command."""
    history_rows = query_db(
        'SELECT DISTINCT value FROM argument_history WHERE command_id = ? AND argument_name = ? ORDER BY id DESC LIMIT 10',
        [command_id, argument_name]
    )
    history = [row['value'] for row in history_rows]
    return jsonify(history)

@app.route('/commands/<command_id>/stop', methods=['POST'])
def stop_command(command_id):
    if command_id not in processes or processes[command_id].poll() is not None:
        return jsonify({'error': 'Command is not running'}), 400
    
    proc = processes[command_id]
    try:
        # Send the signal. The process_monitor_thread will handle the state change.
        os.killpg(os.getpgid(proc.pid), signal.SIGINT)
    except ProcessLookupError:
        pass # Process already terminated
    
    return jsonify({'message': 'Stop signal sent'})

@app.route('/commands/<command_id>', methods=['DELETE'])
def delete_command(command_id):
    execute_db('DELETE FROM commands WHERE id = ?', [command_id])
    execute_db('DELETE FROM argument_history WHERE command_id = ?', [command_id])
    if command_id in processes:
        del processes[command_id]
    socketio.emit('command_deleted', {'command_id': command_id})
    return jsonify({'message': 'Command deleted'}), 200

@app.route('/commands/<command_id>', methods=['PUT'])
def update_command(command_id):
    command_row = query_db('SELECT * FROM commands WHERE id = ?', [command_id], one=True)
    if not command_row:
        return jsonify({'error': 'Command not found'}), 404
    data = request.get_json()
    execute_db('UPDATE commands SET data = ? WHERE id = ?', [json.dumps(data), command_id])
    socketio.emit('command_updated', data)
    return jsonify(data)

if __name__ == '__main__':
    init_db()
    socketio.run(app, debug=False, use_reloader=False)