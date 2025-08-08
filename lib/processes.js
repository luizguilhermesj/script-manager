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

            // Determine the signal to use - use SIGINT for ping commands to get final output
            const isPingCommand = proc.spawnargs && proc.spawnargs.some(arg => arg.includes('ping'));
            const signal = isPingCommand ? 'SIGINT' : 'SIGTERM';

            // Try multiple approaches to kill the process
            try {
                // 1. For ping commands, send SIGINT directly (since we're running without shell)
                if (isPingCommand) {
                    console.log('Attempting graceful termination for ping command...');
                    proc.kill('SIGINT');
                    console.log('Sent SIGINT to ping process directly');
                } else {
                    // For non-ping commands, kill the process directly
                    proc.kill(signal);
                    console.log(`Sent ${signal} to process directly`);
                }

                // 2. Don't remove listeners immediately - let them capture final output
                // We'll remove them after a delay to allow final output to be captured
                console.log('Process killed, waiting for final output...');

                // Set a timeout to remove listeners after allowing final output
                setTimeout(() => {
                    console.log(`[${commandId}] Checking if process is still running after delay...`);
                    if (proc.exitCode === null && !proc.killed) {
                        console.log(`[${commandId}] Process still running, removing listeners anyway`);
                    } else {
                        console.log(`[${commandId}] Process already terminated`);
                    }

                    if (proc.stdout) {
                        console.log(`[${commandId}] Removing stdout listeners after delay`);
                        proc.stdout.removeAllListeners('data');
                    }
                    if (proc.stderr) {
                        console.log(`[${commandId}] Removing stderr listeners after delay`);
                        proc.stderr.removeAllListeners('data');
                    }
                }, 2000); // Wait 2 seconds for final output
            } catch (e) {
                console.log(`Failed to send ${signal} directly:`, e.message);
            }

            // 3. For ping commands, don't immediately kill the process group
            // Let the SIGINT work naturally first
            if (!isPingCommand) {
                try {
                    process.kill(-proc.pid, signal);
                    console.log(`Sent ${signal} to process group`);
                } catch (e) {
                    console.log(`Failed to send ${signal} to process group:`, e.message);
                }
            } else {
                console.log('Skipping process group kill for ping command to allow graceful termination');
            }

            // 4. Force kill after a longer delay only if still running
            // Use longer delay for ping commands to allow graceful termination
            const forceKillDelay = isPingCommand ? 5000 : 1000;
            setTimeout(() => {
                if ((proc.exitCode === null || proc.exitCode === undefined) && !proc.killed) {
                    console.log(`Process still running after ${forceKillDelay}ms, sending SIGKILL...`);
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

                    // Also remove event listeners (but don't destroy streams)
                    if (proc.stdout) {
                        proc.stdout.removeAllListeners('data');
                    }
                    if (proc.stderr) {
                        proc.stderr.removeAllListeners('data');
                    }
                }
            }, forceKillDelay);

            return true;
        } catch (e) {
            console.error('Error killing process:', e);
            return false;
        }
    }
    return false;
};
