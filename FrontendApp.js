import React, { useState, useEffect, useCallback } from 'react';
import CommandCard from './CommandCard';
import { PlusIcon } from './icons';

const API_URL = 'http://localhost:5000'; // Assuming the backend runs on port 5000

const createNewCommand = () => ({
    id: `cmd-${Date.now()}-${Math.random()}`,
    name: 'New Command',
    executable: 'python',
    status: 'idle', // 'idle', 'running', 'success', 'error', 'stopped'
    output: [],
    errorOutput: [],
    generatedCommand: 'python --new-arg ',
    arguments: [{
        id: `arg-${Date.now()}-${Math.random()}`,
        name: '--new-arg',
        value: '',
        type: 'editable',
        options: [],
        sourceCommandId: null,
        regex: '',
        enabled: true,
    }],
});

export default function App() {
    const [commands, setCommands] = useState([]);

    const fetchCommands = useCallback(async () => {
        try {
            const response = await fetch(`${API_URL}/commands`);
            if (response.ok) {
                const data = await response.json();
                setCommands(data);
            } else {
                console.error("Failed to fetch commands");
            }
        } catch (error) {
            console.error("Error fetching commands:", error);
        }
    }, []);

    useEffect(() => {
        fetchCommands();
    }, [fetchCommands]);

    const addCommand = async () => {
        const newCommand = createNewCommand();
        try {
            const response = await fetch(`${API_URL}/commands`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newCommand),
            });
            if (response.ok) {
                fetchCommands();
            }
        } catch (error) {
            console.error("Error adding command:", error);
        }
    };

    const deleteCommand = async (id) => {
        try {
            const response = await fetch(`${API_URL}/commands/${id}`, { method: 'DELETE' });
            if (response.ok) {
                fetchCommands();
            }
        } catch (error) {
            console.error("Error deleting command:", error);
        }
    };

    const updateCommand = useCallback(async (id, updates) => {
        const commandToUpdate = commands.find(c => c.id === id);
        if (!commandToUpdate) return;

        const updatedCommand = { ...commandToUpdate, ...updates };

        try {
            const response = await fetch(`${API_URL}/commands/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedCommand),
            });
            if (response.ok) {
                // Optimistically update the UI
                setCommands(prev => prev.map(cmd => (cmd.id === id ? updatedCommand : cmd)));
            }
        } catch (error) {
            console.error("Error updating command:", error);
        }
    }, [commands]);

    const runCommand = async (commandId) => {
        try {
            const response = await fetch(`${API_URL}/commands/${commandId}/run`, { method: 'POST' });
            const data = await response.json();
            // Update the specific command with the response from the backend
            setCommands(prev => prev.map(cmd => (cmd.id === commandId ? data : cmd)));
        } catch (error) {
            console.error("Error running command:", error);
        }
    };

    const stopCommand = async (commandId) => {
        try {
            const response = await fetch(`${API_URL}/commands/${commandId}/stop`, { method: 'POST' });
            const data = await response.json();
            setCommands(prev => prev.map(cmd => (cmd.id === commandId ? data : cmd)));
        } catch (error) {
            console.error("Error stopping command:", error);
        }
    };

    // Polling to get status updates
    useEffect(() => {
        const interval = setInterval(() => {
            commands.forEach(command => {
                if (command.status === 'running') {
                    fetch(`${API_URL}/commands/${command.id}`)
                        .then(res => res.json())
                        .then(data => {
                            setCommands(prev => prev.map(c => c.id === command.id ? data : c));
                        });
                }
            });
        }, 2000); // Poll every 2 seconds

        return () => clearInterval(interval);
    }, [commands]);

    return (
        <div className="bg-gray-900 text-white min-h-screen font-sans">
            <div className="container mx-auto p-4 md:p-8">
                <header className="mb-8">
                    <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl">
                        Command Chain <span className="text-indigo-400">Dashboard</span>
                    </h1>
                    <p className="mt-3 text-lg text-gray-400">
                        Visually manage, run, and chain your command-line scripts.
                    </p>
                </header>

                <main>
                    {commands.map(cmd => (
                        <CommandCard
                            key={cmd.id}
                            command={cmd}
                            updateCommand={updateCommand}
                            deleteCommand={deleteCommand}
                            runCommand={runCommand}
                            stopCommand={stopCommand}
                            commands={commands}
                        />
                    ))}

                    <div className="mt-8 text-center">
                        <button
                            onClick={addCommand}
                            className="bg-green-600 hover:bg-green-500 text-white font-bold py-2 px-6 rounded-lg transition-colors inline-flex items-center gap-2"
                        >
                            <PlusIcon />
                            Add New Command
                        </button>
                    </div>
                </main>

                <footer className="text-center mt-12 text-gray-500 text-sm">
                    <p>Built with React & Tailwind CSS. Backend processes are real.</p>
                </footer>
            </div>
        </div>
    );
}
