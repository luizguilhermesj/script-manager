import { create } from 'zustand';
import debounce from 'lodash/debounce';
import { getCommands, updateCommand as apiUpdateCommand, runCommand as apiRunCommand, stopCommand as apiStopCommand } from './api';
import { createNewCommand } from './utils';

const useCommandStore = create((set, get) => ({
    socket: null,
    commands: [],
    variables: [],
    loading: true,
    isInitialized: false,

    // --- Actions ---

    debouncedApiUpdate: debounce((command) => {
        apiUpdateCommand(command)
            .then(() => {
                set(state => ({
                    commands: state.commands.map(c =>
                        c.id === command.id ? { ...c, savingStatus: 'success' } : c
                    )
                }));
            })
            .catch(() => {
                set(state => ({
                    commands: state.commands.map(c =>
                        c.id === command.id ? { ...c, savingStatus: 'error' } : c
                    )
                }));
            });
    }, 500),

    fetchInitialData: async () => {
        try {
            const results = await Promise.allSettled([
                getCommands(),
                fetch('/api/variables').then(res => res.json())
            ]);

            const initialCommands = results[0].status === 'fulfilled' ? results[0].value : [];
            const initialVariables = results[1].status === 'fulfilled' ? results[1].value : [];

            set({
                commands: initialCommands
                    .map(cmd => ({
                    ...cmd,
                    output: cmd.output || [],
                    errorOutput: cmd.errorOutput || [],
                        savingStatus: 'success',
                    }))
                    .sort((a, b) => {
                        const pa = a.position ?? Number.POSITIVE_INFINITY;
                        const pb = b.position ?? Number.POSITIVE_INFINITY;
                        if (pa !== pb) return pa - pb;
                        return (a.name || '').localeCompare(b.name || '');
                    }),
                variables: initialVariables,
                loading: false
            });
        } catch (error) {
            set({ loading: false });
        }
    },

    addCommand: () => {
        const socket = get().socket;
        if (!socket) {
            return;
        }
        const nextPosition = get().commands.length;
        socket.emit('create_command', { ...createNewCommand(), position: nextPosition });
    },

    deleteCommand: (commandId) => {
        get().socket.emit('delete_command', { id: commandId });
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

    reorderCommands: (startIndex, endIndex) => {
        const { commands } = get();
        const result = Array.from(commands);
        const [removed] = result.splice(startIndex, 1);
        result.splice(endIndex, 0, removed);

        // Assign positions and update state immediately
        const withPositions = result.map((c, idx) => ({ ...c, position: idx }));
        set({ commands: withPositions });

        // Persist new positions
        Promise.allSettled(withPositions.map(c => apiUpdateCommand(c))).then(() => {
            // Ensure any lingering saving indicators are cleared
            set(state => ({
                commands: state.commands.map(c => ({ ...c, savingStatus: 'success' }))
            }));
        });
    },

    runCommand: async (commandId) => {
        await apiRunCommand(commandId).catch(() => {});
    },

    stopCommand: async (commandId) => {
        await apiStopCommand(commandId).catch((error) => {
            if (error.status === 400 && error.message === 'Command is not running') {
                get().updateCommand(commandId, { status: 'idle', returnCode: null });
            }
        });
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
                const allDeps = [...new Set([...(command.dependsOn || []), ...command.arguments
                    .filter(arg => arg.enabled && arg.isFromOutput && arg.sourceCommandId)
                    .map(arg => arg.sourceCommandId)])];

                allDeps.forEach(depId => getDependencies(depId));
                chain.push(command);
            }
        }

        getDependencies(commandId);

        for (const command of chain) {
            try {
                await new Promise((resolve, reject) => {
                    const onStatusUpdate = (data) => {
                        if (data.id === command.id) {
                            if (data.status === 'success') {
                                get().socket.off('status_update', onStatusUpdate);
                                resolve();
                            } else if (data.status === 'error' || data.status === 'stopped') {
                                get().socket.off('status_update', onStatusUpdate);
                                reject(new Error(`Command "${command.name}" failed`));
                            }
                        }
                    };

                    get().socket.on('status_update', onStatusUpdate);

                    apiRunCommand(command.id).catch((err) => {
                        get().socket.off('status_update', onStatusUpdate);
                        reject(err);
                    });
                });
            } catch (error) {
                return;
            }
        }
    },

    // --- Variable Actions ---
    addVariable: async (name, value) => {
        const id = `var-${Date.now()}`;
        try {
            await fetch('/api/variables', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name, value }),
            });
            set(state => ({ variables: [...state.variables, { id, name, value }] }));
        } catch (error) {
            toast.error('Failed to add variable.');
        }
    },

    updateVariable: async (id, updates) => {
        const originalVariables = get().variables;
        const variableToUpdate = originalVariables.find(v => v.id === id);
        const updatedVariable = { ...variableToUpdate, ...updates };

        set(state => ({
            variables: state.variables.map(v => v.id === id ? updatedVariable : v)
        }));

        try {
            await fetch(`/api/variables/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updatedVariable),
            });
        } catch (error) {
            toast.error('Failed to update variable.');
            set({ variables: originalVariables });
        }
    },

    deleteVariable: async (id) => {
        const originalVariables = get().variables;
        set(state => ({ variables: state.variables.filter(v => v.id !== id) }));
        try {
            await fetch(`/api/variables/${id}`, { method: 'DELETE' });
        } catch (error) {
            toast.error('Failed to delete variable.');
            set({ variables: originalVariables });
        }
    },

    // --- Socket.IO Event Handlers ---
    handleSocketOutput: (data) => {
        set(state => ({
            commands: state.commands.map(cmd => {
                if (cmd.id === data.command_id) {
                    const newOutput = [...(cmd.output || []), data.content];
                    return { ...cmd, output: newOutput };
                }
                return cmd;
            })
        }));
    },

    handleStatusUpdate: (data) => {
        set(state => ({
            commands: state.commands.map(cmd => {
                if (cmd.id === data.id) {
                    // Any backend-driven state change should clear saving indicator
                    return { ...cmd, ...data, savingStatus: 'success' };
                }
                return cmd;
            })
        }));
    },

    handleCommandAdded: (data) => {
        set(state => ({
            commands: [
                ...state.commands,
                {
                    ...data,
                    output: data.output || [],
                    errorOutput: data.errorOutput || [],
                    savingStatus: 'success',
                }
            ]
        }));
    },

    handleCommandDeleted: (data) => {
        const id = data.id || data.command_id;
        if (!id) return;
        set(state => ({ commands: state.commands.filter(c => c.id !== id) }));
    },

    setSocket: (socket) => set({ socket }),
}));

export default useCommandStore;