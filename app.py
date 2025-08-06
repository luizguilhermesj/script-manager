import os
import re
import signal
import subprocess
import threading
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# In-memory data stores
commands = {}
processes = {}
logs = {}

def stream_reader(stream, log_list):
    """Reads a stream line by line and appends to a log list."""
    for line in iter(stream.readline, ''):
        log_list.append(line)
    stream.close()

@app.route('/commands', methods=['POST'])
def create_command():
    data = request.get_json()
    command_id = data.get('id', f"cmd-{Date.now()}-{Math.random()}")
    commands[command_id] = data
    return jsonify(commands[command_id]), 201

@app.route('/commands/<command_id>', methods=['PUT'])
def update_command(command_id):
    if command_id not in commands:
        return jsonify({'error': 'Command not found'}), 404
    data = request.get_json()
    commands[command_id] = data
    return jsonify(commands[command_id])

@app.route('/commands/<command_id>', methods=['DELETE'])
def delete_command(command_id):
    if command_id not in commands:
        return jsonify({'error': 'Command not found'}), 404
    if command_id in processes and processes[command_id].poll() is None:
        return jsonify({'error': 'Cannot delete a running command'}), 400

    del commands[command_id]
    if command_id in processes:
        del processes[command_id]
    if command_id in logs:
        del logs[command_id]

    return jsonify({'message': 'Command deleted successfully'})


@app.route('/commands', methods=['GET'])
def get_commands():
    return jsonify(list(commands.values()))

@app.route('/commands/<command_id>/run', methods=['POST'])
def run_command(command_id):
    if command_id not in commands:
        return jsonify({'error': 'Command not found'}), 404
    if command_id in processes and processes[command_id].poll() is None:
        return jsonify({'error': 'Command is already running'}), 400

    command_def = commands[command_id]

    # --- Argument Resolution ---
    generated_args = []
    for arg in command_def.get('arguments', []):
        if not arg.get('enabled', True):
            continue

        final_value = arg.get('value', '')

        if arg.get('type') == 'variable':
            source_id = arg.get('sourceCommandId')
            source_command = commands.get(source_id)

            if not source_command or source_command.get('status') != 'success':
                error_msg = f"Dependency '{source_command.get('name', 'Unknown')}' has not run successfully."
                command_def['status'] = 'error'
                command_def['errorOutput'] = [error_msg]
                return jsonify({'error': error_msg}), 400

            try:
                regex = re.compile(arg.get('regex', ''))
                full_output = "".join(logs.get(source_id, {}).get('stdout', []))
                match = regex.search(full_output)

                if match and len(match.groups()) > 0:
                    final_value = match.group(1)
                else:
                    error_msg = f"Regex did not find a match in '{source_command.get('name')}' output."
                    command_def['status'] = 'error'
                    command_def['errorOutput'] = [error_msg]
                    return jsonify({'error': error_msg}), 400
            except re.error as e:
                error_msg = f"Invalid Regex: {e}"
                command_def['status'] = 'error'
                command_def['errorOutput'] = [error_msg]
                return jsonify({'error': error_msg}), 400

        if final_value:
            generated_args.append(f"{arg['name']} {final_value}")
        else:
            generated_args.append(arg['name'])

    full_command = f"{command_def['executable']} {' '.join(generated_args)}"
    command_def['generatedCommand'] = full_command

    # Create lists for logs
    logs[command_id] = {'stdout': [], 'stderr': []}

    try:
        proc = subprocess.Popen(
            full_command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            preexec_fn=os.setsid
        )
        processes[command_id] = proc

        stdout_thread = threading.Thread(target=stream_reader, args=(proc.stdout, logs[command_id]['stdout']))
        stderr_thread = threading.Thread(target=stream_reader, args=(proc.stderr, logs[command_id]['stderr']))
        stdout_thread.start()
        stderr_thread.start()

        command_def['status'] = 'running'
        return jsonify(command_def)
    except Exception as e:
        command_def['status'] = 'error'
        command_def['errorOutput'] = [str(e)]
        return jsonify({'error': str(e)}), 500

@app.route('/commands/<command_id>', methods=['GET'])
def get_command_status(command_id):
    if command_id not in commands:
        return jsonify({'error': 'Command not found'}), 404

    command_def = commands[command_id]
    if command_id in processes:
        proc = processes[command_id]
        if proc.poll() is None:
            command_def['status'] = 'running'
        elif command_def['status'] not in ['stopped', 'success', 'error']:
            if proc.returncode == 0:
                command_def['status'] = 'success'
            else:
                command_def['status'] = 'error'

    response = command_def.copy()
    log_data = logs.get(command_id, {})
    response['output'] = log_data.get('stdout', [])
    response['errorOutput'] = log_data.get('stderr', [])
    return jsonify(response)

@app.route('/commands/<command_id>/stop', methods=['POST'])
def stop_command(command_id):
    if command_id not in processes or processes[command_id].poll() is not None:
        return jsonify({'error': 'Command is not running'}), 400

    proc = processes[command_id]
    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    proc.wait()
    commands[command_id]['status'] = 'stopped'
    return jsonify(commands[command_id])

if __name__ == '__main__':
    app.run(debug=True, threaded=True, use_reloader=False)
