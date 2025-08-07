const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { spawn } = require('child_process');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 4000;
const DATABASE = path.join(__dirname, 'commands.db');

// --- Middleware ---
app.use(express.json());
app.use(express.static(path.join(__dirname, 'frontend', 'build')));

// --- Database Setup ---
const fs = require('fs');

let db;

async function initializeDatabase() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database(DATABASE, (err) => {
            if (err) {
                console.error('Error opening database', err.message);
                return reject(err);
            }
            console.log('Connected to the SQLite database.');
            fs.readFile(path.join(__dirname, 'schema.sql'), 'utf8', (err, data) => {
                if (err) {
                    console.error("Could not read schema.sql file:", err);
                    return reject(err);
                }
                db.exec(data, (err) => {
                    if (err) {
                        console.error("Error executing schema:", err);
                        return reject(err);
                    }
                    console.log("Database schema initialized successfully.");
                    resolve();
                });
            });
        });
    });
}


const getDb = (query, params) => {
    return new Promise((resolve, reject) => {
        db.get(query, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
};

const getAllDb = (query, params) => {
    return new Promise((resolve, reject) => {
        db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const runDb = (query, params) => {
    return new Promise((resolve, reject) => {
        db.run(query, params, function(err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
};


// --- In-memory data store for runtime processes ---
const processes = {};

// --- API Routes ---
app.get('/api/commands', async (req, res) => {
    try {
        const rows = await getAllDb("SELECT * FROM commands", []);
        const commands = rows.map(row => JSON.parse(row.data));
        res.json(commands);
    } catch (err) {
        res.status(500).json({ "error": err.message });
    }
});

const validateDependencies = async (commandId, dependsOn) => {
    const getAncestors = async (id, visited = new Set()) => {
        if (visited.has(id)) {
            return new Set(); // Cycle detected
        }
        visited.add(id);

        const row = await getDb("SELECT data FROM commands WHERE id = ?", [id]);
        if (!row) return new Set();

        const command = JSON.parse(row.data);
        const ancestors = new Set(command.dependsOn || []);

        for (const depId of command.dependsOn || []) {
            const parentAncestors = await getAncestors(depId, visited);
            parentAncestors.forEach(a => ancestors.add(a));
        }
        return ancestors;
    };

    for (const depId of dependsOn) {
        const ancestors = await getAncestors(depId);
        if (ancestors.has(commandId)) {
            return false; // Circular dependency detected
        }
    }
    return true;
};

app.put('/api/commands/:command_id', async (req, res) => {
    const { command_id } = req.params;
    const data = req.body;

    if (data.dependsOn) {
        const isValid = await validateDependencies(command_id, data.dependsOn);
        if (!isValid) {
            return res.status(400).json({ error: "Circular dependency detected." });
        }
    }

    try {
        await runDb(`UPDATE commands SET data = ? WHERE id = ?`, [JSON.stringify(data), command_id]);
        io.emit('command_updated', data);
        res.json(data);
    } catch (err) {
        res.status(500).json({ "error": err.message });
    }
});

app.post('/api/commands/:command_id/run', async (req, res) => {
    const { command_id } = req.params;
    console.log(`Received request to run command with ID: ${command_id}`);

    const updateCommandError = async (errorMessage) => {
        const row = await getDb("SELECT data FROM commands WHERE id = ?", [command_id]);
        if (row) {
            const commandDef = JSON.parse(row.data);
            commandDef.status = 'error';
            commandDef.errorOutput = [errorMessage];
            await runDb(`UPDATE commands SET data = ? WHERE id = ?`, [JSON.stringify(commandDef), command_id]);
            io.emit('status_update', commandDef);
        }
    };

    try {
        const row = await getDb("SELECT data FROM commands WHERE id = ?", [command_id]);
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
            const depRow = await getDb("SELECT data FROM commands WHERE id = ?", [depId]);
            if (!depRow) {
                throw new Error(`Dependency with ID '${depId}' not found.`);
            }
            const depDef = JSON.parse(depRow.data);
            if (depDef.status !== 'success') {
                throw new Error(`Dependency '${depDef.name}' has not run successfully.`);
            }
        }

        const variables = await getAllDb("SELECT name, value FROM variables", []);
        const substituteVariables = (str) => {
            let result = str;
            for (const variable of variables) {
                result = result.replace(new RegExp(`{{${variable.name}}}`, 'g'), variable.value);
            }
            return result;
        };

        const executable = substituteVariables(commandDef.executable || '');
        const generatedArgs = [];
        const arguments = commandDef.arguments || [];

        for (const arg of arguments) {
            if (!arg.enabled) continue;

            let final_value = substituteVariables(arg.value || '');
            const arg_name = substituteVariables(arg.name || '');

            if (arg.isFromOutput) {
                if (!arg.sourceCommandId) {
                    throw new Error(`Argument '${arg_name}' is missing a source command.`);
                }
                
                const sourceRow = await getDb("SELECT data FROM commands WHERE id = ?", [arg.sourceCommandId]);
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

                const full_output = (sourceCommandDef.output || []).join('\n');
                
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
                await runDb('INSERT OR IGNORE INTO argument_history (command_id, argument_name, value) VALUES (?, ?, ?)', [command_id, arg_name, final_value]);
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

        const commandToRun = `${executable} ${generatedArgs.join(' ')}`;
        
        commandDef.generatedCommand = commandToRun;
        commandDef.status = 'running';
        commandDef.output = [`$ ${commandToRun}`];
        commandDef.errorOutput = [];
        delete commandDef.returnCode;

        await runDb(`UPDATE commands SET data = ? WHERE id = ?`, [JSON.stringify(commandDef), command_id]);
        io.emit('status_update', commandDef);
        
        const working_dir_raw = commandDef.workingDirectory || '';
        const working_dir = substituteVariables(working_dir_raw, variables) || os.homedir();
        
        console.log(`Executing command in working directory: ${working_dir}`);

        if (!fs.existsSync(working_dir)) {
            throw new Error(`Working directory not found: ${working_dir}`);
        }

        if (working_dir) {
            await runDb('INSERT OR IGNORE INTO working_directory_history (path) VALUES (?)', [working_dir]);
        }
        
        const proc = spawn(commandToRun, { 
            shell: true, 
            stdio: ['pipe', 'pipe', 'pipe'], 
            detached: true,
            cwd: working_dir
        });
        processes[command_id] = proc;

        const stdout_lines = [];
        const stderr_lines = [];

        proc.stdout.on('data', (data) => {
            const output = data.toString().trim();
            stdout_lines.push(output);
            io.emit('stdout', { command_id, output });
        });

        proc.stderr.on('data', (data) => {
            const output = data.toString().trim();
            stderr_lines.push(output);
            io.emit('stderr', { command_id, output });
        });

        proc.on('close', async (code, signal) => {
            const row = await getDb("SELECT data FROM commands WHERE id = ?", [command_id]);
            if (row) {
                const finalCommandDef = JSON.parse(row.data);
                finalCommandDef.status = code === 0 ? 'success' : (signal ? 'stopped' : 'error');
                finalCommandDef.returnCode = code;
                finalCommandDef.output = [...(finalCommandDef.output || []), ...stdout_lines];
                finalCommandDef.errorOutput = [...(finalCommandDef.errorOutput || []), ...stderr_lines];
                await runDb(`UPDATE commands SET data = ? WHERE id = ?`, [JSON.stringify(finalCommandDef), command_id]);
                io.emit('status_update', { id: command_id, status: finalCommandDef.status, returnCode: code });
                delete processes[command_id];
            }
        });
        
        res.json(commandDef);

    } catch (error) {
        await updateCommandError(error.message);
        return res.status(400).json({ error: error.message });
    }
});

app.get('/api/working_directory/history', async (req, res) => {
    try {
        const rows = await getAllDb("SELECT DISTINCT path FROM working_directory_history ORDER BY id DESC LIMIT 10", []);
        res.json(rows.map(r => r.path));
    } catch (err) {
        res.status(500).json({ "error": err.message });
    }
});

app.post('/api/commands/:command_id/stop', (req, res) => {
    const { command_id } = req.params;
    const proc = processes[command_id];
    if (proc && proc.exitCode === null) {
        try {
            process.kill(-proc.pid, 'SIGINT');
        } catch (e) {
            // Process may have already exited
        }
        res.json({ message: 'Stop signal sent' });
    } else {
        res.status(400).json({ error: 'Command is not running' });
    }
});

app.get('/api/commands/:command_id/arguments/:argument_name/history', async (req, res) => {
    const { command_id, argument_name } = req.params;
    try {
        const rows = await getAllDb("SELECT DISTINCT value FROM argument_history WHERE command_id = ? AND argument_name = ? ORDER BY id DESC LIMIT 10", [command_id, argument_name]);
        res.json(rows.map(r => r.value));
    } catch (err) {
        res.status(500).json({ "error": err.message });
    }
});


// --- Variables API ---
app.get('/api/variables', async (req, res) => {
    try {
        const rows = await getAllDb("SELECT * FROM variables", []);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ "error": err.message });
    }
});

app.post('/api/variables', async (req, res) => {
    const { id, name, value } = req.body;
    try {
        await runDb('INSERT INTO variables (id, name, value) VALUES (?, ?, ?)', [id, name, value]);
        res.json({ id, name, value });
    } catch (err) {
        res.status(500).json({ "error": err.message });
    }
});

app.put('/api/variables/:id', async (req, res) => {
    const { id } = req.params;
    const { name, value } = req.body;
    try {
        await runDb('UPDATE variables SET name = ?, value = ? WHERE id = ?', [name, value, id]);
        res.json({ id, name, value });
    } catch (err) {
        res.status(500).json({ "error": err.message });
    }
});

app.delete('/api/variables/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await runDb('DELETE FROM variables WHERE id = ?', [id]);
        res.json({ message: 'Variable deleted' });
    } catch (err) {
        res.status(500).json({ "error": err.message });
    }
});

// --- Socket.IO Handlers ---
io.on('connection', (socket) => {
    console.log('a user connected');

    socket.on('create_command', (data) => {
        const command_id = data.id || `cmd-${Date.now()}`;
        data.id = command_id;
        db.run(`INSERT INTO commands (id, data) VALUES (?, ?)`, [command_id, JSON.stringify(data)], (err) => {
            if (err) {
                console.error('DB insert error:', err);
                return;
            }
            io.emit('command_added', data);
        });
    });

    socket.on('delete_command', (data) => {
        const { id } = data;
        if (id) {
            db.run(`DELETE FROM commands WHERE id = ?`, id, (err) => {
                if (err) {
                    console.error('DB delete error:', err);
                    return;
                }
                db.run(`DELETE FROM argument_history WHERE command_id = ?`, id);
                delete processes[id];
                io.emit('command_deleted', { command_id: id });
            });
        }
    });

    socket.on('disconnect', () => {
        console.log('user disconnected');
    });
});

// --- Serve React App ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'build', 'index.html'));
});

async function startServer() {
    try {
        await initializeDatabase();
        server.listen(PORT, () => {
            console.log(`Server listening on port ${PORT}`);
        });
    } catch (err) {
        console.error("Failed to start the server:", err);
        process.exit(1);
    }
}

startServer();


