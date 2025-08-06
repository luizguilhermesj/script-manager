import { create } from 'zustand';
import { toast } from 'react-hot-toast';
import debounce from 'lodash/debounce';
import socket, { getCommands, createCommand as apiCreateCommand, updateCommand as apiUpdateCommand, deleteCommand as apiDeleteCommand, runCommand as apiRunCommand, stopCommand as apiStopCommand } from './api';
import { createNewCommand } from './utils';

const useCommandStore = create((set, get) => ({
    commands: [],
    loading: true,

    // --- Actions ---

    // Debounced API call for updates
    debouncedApiUpdate: debounce((command) => {
        apiUpdateCommand(command).catch((error) => {
            toast.error(`Failed to save: ${error.message}`);
            set(state => ({
                commands: state.commands.map(c =>
                    c.id === command.id ? { ...c, savingStatus: 'error' } : c
                )
            }));
        });
    }, 500),

    // Fetches initial commands from the backend
    fetchInitialCommands: async () => {
        try {
            const initialCommands = await getCommands();
            set({
                commands: initialCommands.map(cmd => ({
                    ...cmd,
                    output: cmd.output || [],
                    errorOutput: cmd.errorOutput || [],
                    savingStatus: 'success', // Default to 'Saved'
                })),
                loading: false
            });
        } catch (error) {
            toast.error("Failed to fetch commands.");
            set({ loading: false });
        }
    },

    // Adds a new command
    addCommand: () => {
        apiCreateCommand(createNewCommand());
    },

    // Updates a command locally and triggers a debounced save
    updateCommand: (id, updates) => {
        let updatedCommand;
        set(state => ({
            commands: state.commands.map(cmd => {
                if (cmd.id === id) {
                    updatedCommand = { ...cmd, ...updates, savingStatus: 'saving' };
                    return updatedCommand;
                }
                return cmd;
            })
        }));

        if (updatedCommand) {
            get().debouncedApiUpdate(updatedCommand);
        }
    },

    // Deletes a command
    deleteCommand: async (commandId) => {
        try {
            await apiDeleteCommand(commandId);
        } catch (error) {
            toast.error(`Failed to delete command: ${error.message}`);
        }
    },

    // Runs a single command
    runCommand: async (commandId) => {
        try {
            await apiRunCommand(commandId);
        } catch (error) {
            toast.error(`Failed to run command: ${error.message}`);
        }
    },

    // Stops a running command
    stopCommand: async (commandId) => {
        try {
            await apiStopCommand(commandId);
            toast.success('Stop signal sent.');
        } catch (error) {
            toast.error(`Failed to stop command: ${error.message}`);
        }
    },

    // Runs a command and its dependency chain
    runChain: async (commandId) => {
        const commandMap = new Map(get().commands.map(c => [c.id, c]));
        const chain = [];
        const visited = new Set();

        function getDependencies(cmdId) {
            if (visited.has(cmdId)) return;
            visited.add(cmdId);
            const command = commandMap.get(cmdId);
            if (command) {
                command.arguments
                    .filter(arg => arg.enabled && arg.type === 'variable' && arg.sourceCommandId)
                    .forEach(arg => getDependencies(arg.sourceCommandId));
                chain.push(command);
            }
        }

        getDependencies(commandId);

        for (const command of chain) {
            const currentCommandState = get().commands.find(c => c.id === command.id);
            if (currentCommandState.status === 'success') continue;

            try {
                const commandFinishedPromise = new Promise((resolve, reject) => {
                    const onStatusUpdate = (data) => {
                        if (data.id === command.id) {
                            if (data.status === 'success' || data.status === 'stopped') {
                                socket.off('status_update', onStatusUpdate);
                                resolve();
                            } else if (data.status === 'error') {
                                socket.off('status_update', onStatusUpdate);
                                reject(new Error(`Command "${command.name}" failed with status: ${data.status}`));
                            }
                        }
                    };
                    socket.on('status_update', onStatusUpdate);
                });
                await apiRunCommand(command.id);
                await commandFinishedPromise;
            } catch (error) {
                toast.error(error.message);
                return;
            }
        }
    },

    // --- Socket.IO Event Handlers ---
    
    handleCommandAdded: (command) => {
        set(state => ({
            commands: [...state.commands, { ...command, output: [], errorOutput: [], savingStatus: 'success' }]
        }));
        toast.success(`Command "${command.name}" added.`);
    },

    handleCommandDeleted: (data) => {
        set(state => ({
            commands: state.commands.filter(cmd => cmd.id !== data.command_id)
        }));
        toast.success(`Command deleted.`);
    },

    handleCommandUpdated: (command) => {
        set(state => ({
            commands: state.commands.map(cmd => {
                if (cmd.id === command.id) {
                    return { ...cmd, ...command, savingStatus: 'success' };
                }
                return cmd;
            })
        }));
    },

    handleStatusUpdate: (data) => {
        set(state => ({
            commands: state.commands.map(cmd => {
                if (cmd.id !== data.id) return cmd;
                // Full update from 'run' command
                if (data.name) return { ...cmd, ...data };
                // Final status-only update, mark as saved
                return { ...cmd, status: data.status, returnCode: data.returnCode, savingStatus: 'success' };
            })
        }));
    },

    handleStdout: (data) => {
        set(state => ({
            commands: state.commands.map(cmd => {
                if (cmd.id === data.command_id) {
                    return { ...cmd, output: [...(cmd.output || []), data.output] };
                }
                return cmd;
            })
        }));
    },

    handleStderr: (data) => {
        set(state => ({
            commands: state.commands.map(cmd => {
                if (cmd.id === data.command_id) {
                    return { ...cmd, errorOutput: [...(cmd.errorOutput || []), data.output] };
                }
                return cmd;
            })
        }));
    },
}));

// --- Initialize Socket.IO listeners ---
socket.on('command_added', useCommandStore.getState().handleCommandAdded);
socket.on('command_deleted', useCommandStore.getState().handleCommandDeleted);
socket.on('command_updated', useCommandStore.getState().handleCommandUpdated);
socket.on('status_update', useCommandStore.getState().handleStatusUpdate);
socket.on('stdout', useCommandStore.getState().handleStdout);
socket.on('stderr', useCommandStore.getState().handleStderr);

// --- Fetch initial data ---
useCommandStore.getState().fetchInitialCommands();

export default useCommandStore;
