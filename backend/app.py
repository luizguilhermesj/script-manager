import os
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
    command_id = str(len(commands) + 1)
    commands[command_id] = {
        'id': command_id,
        'command': data['command'],
        'status': 'defined'
    }
    return jsonify(commands[command_id]), 201

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

    # Create lists for logs
    logs[command_id] = {'stdout': [], 'stderr': []}

    try:
        # Using Popen to run the command in the background
        proc = subprocess.Popen(
            command_def['command'],
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            preexec_fn=os.setsid  # To kill the whole process group
        )
        processes[command_id] = proc

        # Start threads to read stdout and stderr
        stdout_thread = threading.Thread(target=stream_reader, args=(proc.stdout, logs[command_id]['stdout']))
        stderr_thread = threading.Thread(target=stream_reader, args=(proc.stderr, logs[command_id]['stderr']))
        stdout_thread.start()
        stderr_thread.start()

        command_def['status'] = 'running'
        return jsonify(command_def)
    except Exception as e:
        command_def['status'] = 'error'
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
        # Only update if the process finished and wasn't manually stopped
        elif command_def['status'] != 'stopped':
            if proc.returncode == 0:
                command_def['status'] = 'completed'
            else:
                command_def['status'] = 'error'

    response = command_def.copy()
    response.update(logs.get(command_id, {}))
    return jsonify(response)

@app.route('/commands/<command_id>/stop', methods=['POST'])
def stop_command(command_id):
    if command_id not in processes or processes[command_id].poll() is not None:
        return jsonify({'error': 'Command is not running'}), 400

    proc = processes[command_id]
    os.killpg(os.getpgid(proc.pid), signal.SIGTERM)  # Send SIGTERM to the process group
    proc.wait()  # Wait for the process to terminate
    commands[command_id]['status'] = 'stopped'
    return jsonify(commands[command_id])

if __name__ == '__main__':
    app.run(debug=True, threaded=True, use_reloader=False)
