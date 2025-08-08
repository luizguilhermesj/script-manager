import { initializeDatabase } from '@lib/db';
import { spawn } from 'child_process';
import os from 'os';
import fs from 'fs';
import { processes } from '@lib/processes';

export default async function handler(req, res) {
    const { command_id } = req.query;
    const db = await initializeDatabase();
    const io = res.socket.server.io;

    if (req.method === 'POST') {
        const updateCommandError = async (errorMessage) => {
            const row = await db.get("SELECT data FROM commands WHERE id = ?", [command_id]);
            if (row) {
                const commandDef = JSON.parse(row.data);
                commandDef.status = 'error';
                commandDef.errorOutput = [errorMessage];
                await db.run(`UPDATE commands SET data = ? WHERE id = ?`, [JSON.stringify(commandDef), command_id]);
                io.emit('status_update', commandDef);
            }
        };

        try {
            const row = await db.get("SELECT data FROM commands WHERE id = ?", [command_id]);
            if (!row) {
                return res.status(404).json({ 'error': 'Command not found' });
            }

            let commandDef = JSON.parse(row.data);

            if (processes[command_id] && processes[command_id].exitCode === null) {
                return res.status(400).json({ 'error': 'Command is already running' });
            }

            const allDeps = [...new Set([...(commandDef.dependsOn || []), ...commandDef.arguments
                .filter(arg => arg.enabled && arg.isFromOutput && arg.sourceCommandId)
                .map(arg => arg.sourceCommandId)])];

            for (const depId of allDeps) {
                const depRow = await db.get("SELECT data FROM commands WHERE id = ?", [depId]);
                if (!depRow) {
                    throw new Error(`Dependency with ID '${depId}' not found.`);
                }
                const depDef = JSON.parse(depRow.data);
                if (depDef.status !== 'success') {
                    throw new Error(`Dependency '${depDef.name}' has not run successfully.`);
                }
            }

            const variables = await db.all("SELECT name, value FROM variables", []);
            const substituteVariables = (str) => {
                let result = str;
                for (const variable of variables) {
                    result = result.replace(new RegExp(`{{${variable.name}}}`, 'g'), variable.value);
                }
                return result;
            };

            const executable = substituteVariables(commandDef.executable || '');
            const generatedArgs = [];
            const commandArgs = commandDef.arguments || [];

            for (const arg of commandArgs) {
                if (!arg.enabled) continue;

                let final_value = substituteVariables(arg.value || '');
                const arg_name = substituteVariables(arg.name || '');

                if (arg.isFromOutput) {
                    if (!arg.sourceCommandId) {
                        throw new Error(`Argument '${arg_name}' is missing a source command.`);
                    }

                    const sourceRow = await db.get("SELECT data FROM commands WHERE id = ?", [arg.sourceCommandId]);
                    if (!sourceRow) {
                        throw new Error(`Source command with ID '${arg.sourceCommandId}' not found.`);
                    }
                    const sourceCommandDef = JSON.parse(sourceRow.data);
                    const sourceCommandName = sourceCommandDef.name || 'Unknown';

                    if (sourceCommandDef.status !== 'success') {
                        throw new Error(`Dependency '${sourceCommandName}' has not run successfully.`);
                    }

                    if (!arg.regex) {
                        throw new Error(`Argument '${arg_name}' is missing a regex pattern.`);
                    }

                    const full_output = (sourceCommandDef.output || []).slice(1).map(line => line.content).join('\n');

                    try {
                        const match = full_output.match(new RegExp(substituteVariables(arg.regex)));
                        if (match) {
                            final_value = match[1] ? match[1] : match[0];
                        } else {
                            throw new Error(`Regex did not find a match in the output of '${sourceCommandName}'.`);
                        }
                    } catch (e) {
                        throw new Error(`Invalid regex for argument '${arg_name}': ${e.message}`);
                    }
                }

                if (!arg.isFromOutput && final_value) {
                    await db.run('INSERT OR IGNORE INTO argument_history (command_id, argument_name, value) VALUES (?, ?, ?)', [command_id, arg_name, final_value]);
                }

                if (arg.isPositional) {
                    if (final_value) generatedArgs.push(final_value);
                } else {
                    const joiner = arg.joiner === undefined ? ' ' : arg.joiner;
                    if (final_value) {
                        generatedArgs.push(`${arg_name}${joiner}${final_value}`);
                    } else {
                        generatedArgs.push(arg_name);
                    }
                }
            }

            // For ping commands, add a timeout to ensure graceful termination
            let commandToRun = `${executable} ${generatedArgs.join(' ')}`;
            if (executable.includes('ping') && !generatedArgs.some(arg => arg.includes('-c') || arg.includes('-w'))) {
                // Add a timeout of 30 seconds to ping commands for graceful termination
                commandToRun = `${executable} -w 30 ${generatedArgs.join(' ')}`;
                console.log(`[${command_id}] Modified ping command with timeout:`, commandToRun);
            }

            commandDef.generatedCommand = commandToRun;
            commandDef.status = 'running';
            commandDef.output = [`$ ${commandToRun}`];
            commandDef.errorOutput = [];
            delete commandDef.returnCode;

            await db.run(`UPDATE commands SET data = ? WHERE id = ?`, [JSON.stringify(commandDef), command_id]);
            io.emit('status_update', commandDef);

            const working_dir_raw = commandDef.workingDirectory || '';
            const working_dir = substituteVariables(working_dir_raw, variables) || os.homedir();

            if (!fs.existsSync(working_dir)) {
                throw new Error(`Working directory not found: ${working_dir}`);
            }

            if (working_dir) {
                await db.run('INSERT OR IGNORE INTO working_directory_history (path) VALUES (?)', [working_dir]);
            }

            // For ping commands, try to run without shell for better signal handling
            let proc;
            if (executable.includes('ping')) {
                // Run ping directly without shell for better signal handling
                const pingArgs = generatedArgs.filter(arg => arg !== executable);
                console.log(`[${command_id}] Running ping directly with args:`, pingArgs);
                proc = spawn(executable, pingArgs, {
                    stdio: ['pipe', 'pipe', 'pipe'],
                    detached: false,
                    cwd: working_dir
                });
            } else {
                // For other commands, use shell
                proc = spawn(commandToRun, {
                    shell: true,
                    stdio: ['pipe', 'pipe', 'pipe'],
                    detached: false,
                    cwd: working_dir
                });
            }
            processes[command_id] = proc;
            console.log('Stored process for command:', command_id);
            console.log('All processes keys after storing:', Object.keys(processes));

            proc.stdout.on('data', (data) => {
                const output = data.toString().trim();
                console.log(`[${command_id}] stdout:`, output);
                io.emit('output', { command_id, type: 'stdout', content: output });
            });

            proc.stderr.on('data', (data) => {
                const output = data.toString().trim();
                console.log(`[${command_id}] stderr:`, output);
                io.emit('output', { command_id, type: 'stderr', content: output });
            });

            // Add logging for when streams end
            proc.stdout.on('end', () => {
                console.log(`[${command_id}] stdout stream ended`);
            });

            proc.stderr.on('end', () => {
                console.log(`[${command_id}] stderr stream ended`);
            });

            proc.on('close', async (code, signal) => {
                console.log(`[${command_id}] Process closed with code:`, code, 'signal:', signal);
                const row = await db.get("SELECT data FROM commands WHERE id = ?", [command_id]);
                if (row) {
                    const finalCommandDef = JSON.parse(row.data);
                    finalCommandDef.status = code === 0 ? 'success' : (signal ? 'stopped' : 'error');
                    finalCommandDef.returnCode = code;
                    await db.run(`UPDATE commands SET data = ? WHERE id = ?`, [JSON.stringify(finalCommandDef), command_id]);

                    // Don't send output in status update to preserve accumulated output
                    const { output, errorOutput, ...statusUpdate } = finalCommandDef;
                    io.emit('status_update', statusUpdate);

                    delete processes[command_id];
                    console.log(`[${command_id}] Process cleanup completed`);
                }
            });

            res.status(200).json(commandDef);

        } catch (error) {
            await updateCommandError(error.message);
            return res.status(400).json({ error: error.message });
        }
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
