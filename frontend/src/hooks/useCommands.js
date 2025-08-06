import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import debounce from 'lodash/debounce';
import socket, { getCommands, createCommand as apiCreateCommand, updateCommand as apiUpdateCommand, deleteCommand as apiDeleteCommand, runCommand as apiRunCommand, stopCommand as apiStopCommand } from '../api';
import { createNewCommand } from '../utils';

export const useCommands = () => {
    const [commands, setCommands] = useState([]);
    const [loading, setLoading] = useState(true);

    const commandsRef = useRef(commands);
    useEffect(() => {
        commandsRef.current = commands;
    }, [commands]);

    const debouncedApiUpdate = useRef(
        debounce((command) => {
            apiUpdateCommand(command).catch((error) => {
                toast.error(`Failed to save: ${error.message}`);
                setCommands(prev => prev.map(c => 
                    c.id === command.id ? { ...c, savingStatus: 'error' } : c
                ));
            });
        }, 500)
    ).current;

    useEffect(() => {
        const fetchInitialCommands = async () => {
            try {
                const initialCommands = await getCommands();
                setCommands(initialCommands.map(cmd => ({
                    ...cmd,
                    output: cmd.output || [],
                    errorOutput: cmd.errorOutput || [],
                    savingStatus: 'success', // Default to success ('Saved')
                })));
            } catch (error) {
                toast.error("Failed to fetch commands.");
            } finally {
                setLoading(false);
            }
        };
        fetchInitialCommands();

        const handleStatusUpdate = (data) => {
            setCommands(prev => prev.map(cmd => {
                if (cmd.id !== data.id) return cmd;
                if (data.name) return { ...cmd, ...data };
                return { ...cmd, status: data.status, returnCode: data.returnCode };
            }));
        };

        const handleStdout = (data) => {
            setCommands(prev => prev.map(cmd => {
                if (cmd.id === data.command_id) {
                    return { ...cmd, output: [...(cmd.output || []), data.output] };
                }
                return cmd;
            }));
        };

        const handleStderr = (data) => {
            setCommands(prev => prev.map(cmd => {
                if (cmd.id === data.command_id) {
                    return { ...cmd, errorOutput: [...(cmd.errorOutput || []), data.output] };
                }
                return cmd;
            }));
        };
        
        const handleCommandAdded = (command) => {
            setCommands(prev => [...prev, { ...command, output: [], errorOutput: [], savingStatus: 'success' }]);
            toast.success(`Command "${command.name}" added.`);
        };

        const handleCommandDeleted = (data) => {
            setCommands(prev => prev.filter(cmd => cmd.id !== data.command_id));
            toast.success(`Command deleted.`);
        };
        
        const handleCommandUpdated = (command) => {
            setCommands(prev => prev.map(cmd => {
                if (cmd.id === command.id) {
                    return { ...cmd, ...command, savingStatus: 'success' };
                }
                return cmd;
            }));
        };

        socket.on('status_update', handleStatusUpdate);
        socket.on('stdout', handleStdout);
        socket.on('stderr', handleStderr);
        socket.on('command_added', handleCommandAdded);
        socket.on('command_deleted', handleCommandDeleted);
        socket.on('command_updated', handleCommandUpdated);

        return () => {
            socket.off('status_update', handleStatusUpdate);
            socket.off('stdout', handleStdout);
            socket.off('stderr', handleStderr);
            socket.off('command_added', handleCommandAdded);
            socket.off('command_deleted', handleCommandDeleted);
            socket.off('command_updated', handleCommandUpdated);
        };
    }, [debouncedApiUpdate]);

    const addCommand = () => {
        apiCreateCommand(createNewCommand());
    };

    const updateCommand = useCallback((id, updates) => {
        let updatedCommand;
        setCommands(prev => {
            return prev.map(cmd => {
                if (cmd.id === id) {
                    updatedCommand = { ...cmd, ...updates, savingStatus: 'saving' };
                    return updatedCommand;
                }
                return cmd;
            });
        });

        if (updatedCommand) {
            debouncedApiUpdate(updatedCommand);
        }
    }, [debouncedApiUpdate]);

    const runChain = async (commandId) => {
        const commandMap = new Map(commandsRef.current.map(c => [c.id, c]));
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
            const currentCommandState = commandsRef.current.find(c => c.id === command.id);
            if (currentCommandState.status === 'success') continue;
            
            try {
                const commandFinishedPromise = new Promise((resolve, reject) => {
                    const onStatusUpdate = (data) => {
                        if (data.id === command.id) {
                            if (data.status === 'success') {
                                socket.off('status_update', onStatusUpdate);
                                resolve();
                            } else if (data.status === 'error' || data.status === 'stopped') {
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
    };

    const stopCommand = async (commandId) => {
        try {
            await apiStopCommand(commandId);
            toast.success('Stop signal sent.');
        } catch (error) {
            toast.error(`Failed to stop command: ${error.message}`);
        }
    };

    return { commands, loading, addCommand, updateCommand, deleteCommand: apiDeleteCommand, runCommand: apiRunCommand, stopCommand, runChain };
};
