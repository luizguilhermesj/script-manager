import { create } from 'zustand';
import { toast } from 'react-hot-toast';
import debounce from 'lodash/debounce';
import socket, { getCommands, updateCommand as apiUpdateCommand, runCommand as apiRunCommand, stopCommand as apiStopCommand } from './api';
import { createNewCommand } from './utils';

const useCommandStore = create((set, get) => ({
    commands: [],
    loading: true,
    isInitialized: false,

    // --- Actions ---

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

    fetchInitialCommands: async () => {
        try {
            const initialCommands = await getCommands();
            set({
                commands: initialCommands.map(cmd => ({
                    ...cmd,
                    output: cmd.output || [],
                    errorOutput: cmd.errorOutput || [],
                    savingStatus: 'success',
                })),
                loading: false
            });
        } catch (error) {
            toast.error("Failed to fetch commands.");
            set({ loading: false });
        }
    },

    addCommand: () => {
        socket.emit('create_command', createNewCommand());
    },

    deleteCommand: (commandId) => {
        socket.emit('delete_command', { id: commandId });
    },

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

    runCommand: async (commandId) => {
        try {
            await apiRunCommand(commandId);
        } catch (error) {
            toast.error(`Failed to run command: ${error.message}`);
        }
    },

    stopCommand: async (commandId) => {
        try {
            await apiStopCommand(commandId);
            toast.success('Stop signal sent.');
        } catch (error) {
            toast.error(`Failed to stop command: ${error.message}`);
        }
    },

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
    initSocketListeners: () => {
        if (get().isInitialized) return;

        socket.on('command_added', (command) => {
            set(state => ({
                commands: [...state.commands, { ...command, output: [], errorOutput: [], savingStatus: 'success' }]
            }));
            toast.success(`Command "${command.name}" added.`);
        });

        socket.on('command_deleted', (data) => {
            set(state => ({
                commands: state.commands.filter(cmd => cmd.id !== data.command_id)
            }));
            toast.success(`Command deleted.`);
        });

        socket.on('command_updated', (command) => {
            set(state => ({
                commands: state.commands.map(cmd => {
                    if (cmd.id === command.id) {
                        return { ...cmd, ...command, savingStatus: 'success' };
                    }
                    return cmd;
                })
            }));
        });

        socket.on('status_update', (data) => {
            set(state => ({
                commands: state.commands.map(cmd => {
                    if (cmd.id !== data.id) return cmd;
                    if (data.name) return { ...cmd, ...data };
                    return { ...cmd, status: data.status, returnCode: data.returnCode, savingStatus: 'success' };
                })
            }));
        });

        socket.on('stdout', (data) => {
            set(state => ({
                commands: state.commands.map(cmd => {
                    if (cmd.id === data.command_id) {
                        return { ...cmd, output: [...(cmd.output || []), data.output] };
                    }
                    return cmd;
                })
            }));
        });

        socket.on('stderr', (data) => {
            set(state => ({
                commands: state.commands.map(cmd => {
                    if (cmd.id === data.command_id) {
                        return { ...cmd, errorOutput: [...(cmd.errorOutput || []), data.output] };
                    }
                    return cmd;
                })
            }));
        });

        set({ isInitialized: true });
    },
}));

// Initialize after creation
useCommandStore.getState().initSocketListeners();
useCommandStore.getState().fetchInitialCommands();

export default useCommandStore;
