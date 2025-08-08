// This object will hold the references to the running child processes.
// Using global to ensure it's shared across all API routes
if (typeof global.processes === 'undefined') {
    global.processes = {};
}
export const processes = global.processes;

// Helper function to kill a process and clean up
export const killProcess = (commandId) => {
    const proc = processes[commandId];
    console.log('killProcess called for commandId:', commandId);
    console.log('Process object:', proc);
    console.log('Process exitCode:', proc?.exitCode);
    console.log('Process killed:', proc?.killed);

    // More robust check for running process
    const isRunning = proc &&
        (proc.exitCode === null || proc.exitCode === undefined) &&
        !proc.killed &&
        proc.pid;

    if (isRunning) {
        try {
            console.log('Attempting to kill process with PID:', proc.pid);

            // Try multiple approaches to kill the process
            try {
                // 1. Kill the process directly
                proc.kill('SIGTERM');
                console.log('Sent SIGTERM to process directly');

                // 2. Immediately remove event listeners to stop output
                if (proc.stdout) {
                    proc.stdout.removeAllListeners('data');
                    proc.stdout.destroy();
                }
                if (proc.stderr) {
                    proc.stderr.removeAllListeners('data');
                    proc.stderr.destroy();
                }
            } catch (e) {
                console.log('Failed to send SIGTERM directly:', e.message);
            }

            try {
                // 3. Kill the process group
                process.kill(-proc.pid, 'SIGTERM');
                console.log('Sent SIGTERM to process group');
            } catch (e) {
                console.log('Failed to send SIGTERM to process group:', e.message);
            }

            // 3. Force kill after a short delay only if still running
            setTimeout(() => {
                if ((proc.exitCode === null || proc.exitCode === undefined) && !proc.killed) {
                    console.log('Process still running, sending SIGKILL...');
                    try {
                        proc.kill('SIGKILL');
                        console.log('Sent SIGKILL to process directly');
                    } catch (e) {
                        console.log('Failed to send SIGKILL directly:', e.message);
                    }

                    try {
                        process.kill(-proc.pid, 'SIGKILL');
                        console.log('Sent SIGKILL to process group');
                    } catch (e) {
                        console.log('Failed to send SIGKILL to process group:', e.message);
                    }
                } else {
                    console.log('Process already terminated');
                    // Clean up the process from our tracking
                    delete processes[commandId];

                    // Also remove event listeners
                    if (proc.stdout) {
                        proc.stdout.removeAllListeners('data');
                    }
                    if (proc.stderr) {
                        proc.stderr.removeAllListeners('data');
                    }
                }
            }, 1000);

            return true;
        } catch (e) {
            console.error('Error killing process:', e);
            return false;
        }
    }
    return false;
};
