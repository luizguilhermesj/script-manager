import React, { useState, useEffect, useMemo } from 'react';
import ArgumentEditor from './ArgumentEditor';
import { PlusIcon, TrashIcon, PlayIcon, StopIcon, ChevronUpIcon, ChevronDownIcon, SavingIcon, SavedIcon, ErrorIcon } from './Icons';
import { createNewArgument } from '../lib/utils';
import useCommandStore from '../lib/store';
import debounce from 'lodash/debounce';

import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

const substituteVariables = (str, variables) => {
    let result = str;
    for (const variable of variables) {
        result = result.replace(new RegExp(`{{${variable.name}}}`, 'g'), variable.value);
    }
    return result;
};

const CommandCard = ({ command, runCommand, stopCommand, deleteCommand, runChain }) => {
    const { commands, variables, updateCommand } = useCommandStore();
    const [isOutputVisible, setIsOutputVisible] = useState(true);
    const [workingDirHistory, setWorkingDirHistory] = useState([]);
    const [localCommand, setLocalCommand] = useState(command);

    const debouncedUpdate = useMemo(
        () => debounce((newCommand) => updateCommand(newCommand.id, newCommand), 500),
        [updateCommand]
    );

    useEffect(() => {
        setLocalCommand(command);
    }, [command]);

    const handleChange = (updates) => {
        const newCommand = { ...localCommand, ...updates };
        setLocalCommand(newCommand);
        debouncedUpdate(newCommand);
    };

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const response = await fetch('/api/working_directory/history');
                const data = await response.json();
                setWorkingDirHistory(data);
            } catch (error) {
                console.error('Error fetching working directory history:', error);
            }
        };
        fetchHistory();
    }, []);

    const onDragEnd = (result) => {
        if (!result.destination) {
            return;
        }
        const newArgs = Array.from(localCommand.arguments);
        const [removed] = newArgs.splice(result.source.index, 1);
        newArgs.splice(result.destination.index, 0, removed);
        handleChange({ arguments: newArgs });
    };

    const implicitDependencies = useMemo(() => {
        return localCommand.arguments
            .filter(arg => arg.enabled && arg.isFromOutput && arg.sourceCommandId)
            .map(arg => arg.sourceCommandId);
    }, [localCommand.arguments]);

    const dependencies = useMemo(() => {
        const allDeps = [...new Set([...(localCommand.dependsOn || []), ...implicitDependencies])];
        return allDeps.map(depId => commands.find(c => c.id === depId)).filter(Boolean);
    }, [localCommand.dependsOn, implicitDependencies, commands]);

    const areDependenciesMet = useMemo(() => {
        return dependencies.every(dep => dep.status === 'success');
    }, [dependencies]);

    const availableDependencies = useMemo(() => {
        const dependenciesOfThisCommand = new Set(localCommand.dependsOn || []);
        const getDescendants = (commandId, commands, visited = new Set()) => {
            if (visited.has(commandId)) {
                return new Set();
            }
            visited.add(commandId);

            let descendants = new Set();
            const command = commands.find(c => c.id === commandId);
            if (!command || !command.dependsOn) return descendants;

            for (const depId of command.dependsOn) {
                if (!descendants.has(depId)) {
                    descendants.add(depId);
                    getDescendants(depId, commands, visited).forEach(d => descendants.add(d));
                }
            }
            return descendants;
        };

        const commandsThatDependOnThis = new Set();
        for (const c of commands) {
            if (getDescendants(c.id, commands).has(command.id)) {
                commandsThatDependOnThis.add(c.id);
            }
        }

        return commands.filter(c =>
            c.id !== localCommand.id &&
            !dependenciesOfThisCommand.has(c.id) &&
            !commandsThatDependOnThis.has(c.id)
        );
    }, [commands, localCommand.id, localCommand.dependsOn]);

    const displayCommand = useMemo(() => {
        const generatedArgs = localCommand.arguments
            .filter(arg => arg.enabled)
            .map(arg => {
                let value = substituteVariables(arg.value, variables);
                if (arg.isFromOutput) {
                    const sourceCommand = commands.find(c => c.id === arg.sourceCommandId);
                    if (!sourceCommand) {
                        value = '<invalid source>';
                    } else if (sourceCommand.status !== 'success') {
                        value = `<run '${sourceCommand.name}'>`;
                    } else if (!arg.regex) {
                        value = '<add regex>';
                    } else {
                        try {
                            const regex = new RegExp(substituteVariables(arg.regex, variables));
                            const fullOutput = sourceCommand.output.map(line => line.content).join('\n');
                            const match = fullOutput.match(regex);
                            value = (match && match[1]) ? match[1] : '<no match>';
                        } catch (e) {
                            value = '<invalid regex>';
                        }
                    }
                }

                if (arg.isPositional) {
                    return value || '';
                } else {
                    const joiner = arg.joiner === undefined ? ' ' : arg.joiner;
                    return value ? `${substituteVariables(arg.name, variables)}${joiner}${value}` : substituteVariables(arg.name, variables);
                }
            });

        return `${substituteVariables(localCommand.executable, variables)} ${generatedArgs.filter(Boolean).join(' ')}`;
    }, [localCommand.arguments, localCommand.executable, commands, variables]);

    const displayCommandWithHighlighting = useMemo(() => {
        const parts = displayCommand.split(/({{.*?}})/g).map((part, index) => {
            const match = part.match(/{{(.*?)}}/);
            if (match) {
                const varName = match[1];
                const variable = variables.find(v => v.name === varName);
                return <span key={index} className="variable">{variable ? variable.value : 'undefined'}</span>;
            }
            return part;
        });
        return <span>{parts}</span>;
    }, [displayCommand, variables]);

    const addArgument = () => {
        const newArgs = [...localCommand.arguments, createNewArgument()];
        handleChange({ arguments: newArgs });
    };

    const statusStyles = {
        idle: 'border-gray-700',
        running: 'border-blue-500 animate-pulse',
        success: 'border-green-500',
        error: 'border-red-500',
        stopped: 'border-yellow-500',
    };

    const statusText = {
        idle: 'Idle',
        running: 'Running...',
        success: 'Success',
        error: 'Error',
        stopped: 'Stopped',
    };

    const statusColor = {
        idle: 'text-gray-400',
        running: 'text-blue-400',
        success: 'text-green-400',
        error: 'text-red-400',
        stopped: 'text-yellow-400',
    };

    const runButtonTooltip = !areDependenciesMet
        ? `Dependencies not met: ${dependencies.map(d => d.name).join(', ')}`
        : "Run this command";

    const [localName, setLocalName] = useState(command.name);
    const [localExecutable, setLocalExecutable] = useState(command.executable);

    useEffect(() => {
        setLocalName(command.name);
        setLocalExecutable(command.executable);
    }, [command.name, command.executable]);

    const handleBlur = (field, value) => {
        handleChange({ [field]: value });
    };

    const [activeTab, setActiveTab] = useState('stdout');

    useEffect(() => {
        if (command.errorOutput && command.errorOutput.length > 0) {
            setActiveTab('stderr');
        }
    }, [command.errorOutput]);

    const [isCollapsed, setIsCollapsed] = useState(false);

    const handleDelete = () => {
        if (window.confirm(`Are you sure you want to delete the command "${command.name}"?`)) {
            deleteCommand(command.id);
        }
    };

    const SaveStatus = () => {
        switch (command.savingStatus) {
            case 'saving':
                return (
                    <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <SavingIcon />
                        <span>Saving...</span>
                    </div>
                );
            case 'success':
                return (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                        <SavedIcon />
                        <span>Saved</span>
                    </div>
                );
            case 'error':
                return (
                    <div className="flex items-center gap-2 text-red-500 text-sm">
                        <ErrorIcon />
                        <span>Error</span>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className={`bg-gray-800/50 border-l-4 ${statusStyles[command.status]} rounded-lg shadow-lg mb-6`}>
            <div className="p-4 border-b border-gray-700/50 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-grow">
                    <button onClick={() => setIsCollapsed(!isCollapsed)} className="text-gray-400 hover:text-white">
                        {isCollapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
                    </button>
                    <div className={`w-3 h-3 rounded-full ${statusColor[command.status].replace('text-', 'bg-')}`}></div>
                    <input
                        type="text"
                        value={localName}
                        onChange={(e) => setLocalName(e.target.value)}
                        onBlur={() => handleBlur('name', localName)}
                        className="text-xl font-bold bg-transparent focus:bg-gray-700 rounded-md px-2 py-1 -ml-2"
                    />
                </div>
                <div className="flex items-center gap-4">
                    <SaveStatus />
                    <button onClick={handleDelete} className="text-gray-500 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-gray-700">
                        <TrashIcon />
                    </button>
                    {command.status === 'running' ? (
                        <button onClick={() => stopCommand(command.id)} className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                            <StopIcon />
                            <span>Stop</span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-2">
                            {dependencies.length > 0 && (
                                <button
                                    onClick={() => runChain(command.id)}
                                    className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                                    title="Run this command and all its dependencies in order"
                                >
                                    <PlayIcon />
                                    <span>Run Chain</span>
                                </button>
                            )}
                            <button
                                onClick={() => runCommand(command.id)}
                                className={`flex items-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg transition-colors ${!areDependenciesMet ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-500'}`}
                                disabled={!areDependenciesMet}
                                title={runButtonTooltip}
                            >
                                <PlayIcon />
                                <span>Run</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {!isCollapsed && (
                <div>
                    <div className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            <div className="md:col-span-1">
                                <label className="text-sm font-semibold text-gray-400">Executable</label>
                                <input
                                    type="text"
                                    value={localExecutable}
                                    onChange={(e) => setLocalExecutable(e.target.value)}
                                    onBlur={() => handleBlur('executable', localExecutable)}
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 mt-1 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-sm font-semibold text-gray-400">Working Directory</label>
                                <input
                                    type="text"
                                    value={localCommand.workingDirectory || ''}
                                    onChange={(e) => handleChange({ workingDirectory: e.target.value })}
                                    placeholder="e.g., /home/username"
                                    list="working-dir-history"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 mt-1 focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <datalist id="working-dir-history">
                                    {workingDirHistory.map((path, i) => <option key={i} value={path} />)}
                                </datalist>
                            </div>
                            <div className="md:col-span-3">
                                <label className="text-sm font-semibold text-gray-400">Explicit Dependencies</label>
                                <div className="mt-1">
                                    <div className="flex flex-wrap gap-2">
                                        {dependencies.map(dep => (
                                            <div key={dep.id} className="flex items-center bg-gray-700 rounded-full px-3 py-1 text-sm">
                                                <span>{dep.name}</span>
                                                <button
                                                    onClick={() => {
                                                        const newDeps = (localCommand.dependsOn || []).filter(id => id !== dep.id);
                                                        handleChange({ dependsOn: newDeps });
                                                    }}
                                                    className="ml-2 text-gray-400 hover:text-white"
                                                >
                                                    &times;
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                    {availableDependencies.length > 0 && (
                                        <select
                                            value=""
                                            onChange={(e) => {
                                                const newDeps = [...(localCommand.dependsOn || []), e.target.value];
                                                handleChange({ dependsOn: newDeps });
                                            }}
                                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 mt-2 focus:ring-indigo-500 focus:border-indigo-500"
                                        >
                                            <option value="" disabled>Add a dependency...</option>
                                            {availableDependencies.map(c => (
                                                <option key={c.id} value={c.id}>{c.name}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500 mt-1">Select commands that must run successfully before this one.</p>
                            </div>
                            <div className="md:col-span-3 relative">
                                <label className="text-sm font-semibold text-gray-400">Generated Command</label>
                                <div className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 mt-1 font-mono text-sm text-green-400 overflow-x-auto whitespace-pre">
                                    {displayCommandWithHighlighting || <span className="text-gray-500">Press 'Run' to generate...</span>}
                                </div>
                                <button
                                    onClick={() => navigator.clipboard.writeText(displayCommand)}
                                    className="absolute top-6 right-2 text-gray-400 hover:text-white"
                                    title="Copy to clipboard"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                        <path d="M8 2a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2H8zM4 4a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <h3 className="text-lg font-semibold mb-3 text-gray-300">Arguments</h3>
                        <DragDropContext onDragEnd={onDragEnd}>
                            <Droppable droppableId={`args-${command.id}`}>
                                {(provided) => (
                                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2">
                                        {command.arguments.map((arg, index) => (
                                            <Draggable key={arg.id} draggableId={arg.id} index={index}>
                                                {(provided) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                    >
                                                        <ArgumentEditor
                                                            argument={arg}
                                                            commandId={command.id}
                                                            onUpdate={(updates) => {
                                                                const newArgs = localCommand.arguments.map(a => a.id === arg.id ? { ...a, ...updates } : a);
                                                                handleChange({ arguments: newArgs });
                                                            }}
                                                            onDelete={() => {
                                                                const newArgs = localCommand.arguments.filter(a => a.id !== arg.id);
                                                                handleChange({ arguments: newArgs });
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </DragDropContext>
                        <button
                            onClick={addArgument}
                            className="mt-4 flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-semibold text-sm"
                        >
                            <PlusIcon />
                            Add Argument
                        </button>
                    </div>

                    <div className="border-t border-gray-700/50">
                        <button onClick={() => setIsOutputVisible(!isOutputVisible)} className="w-full p-3 text-left flex justify-between items-center bg-gray-800 hover:bg-gray-700/50 transition-colors">
                            <span className="font-semibold text-gray-300">Output & Status</span>
                            {isOutputVisible ? <ChevronUpIcon /> : <ChevronDownIcon />}
                        </button>
                        {isOutputVisible && (
                            <div className="p-4 bg-gray-900/70">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <span className={`font-semibold ${statusColor[command.status]}`}>Status: {statusText[command.status]}</span>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {command.returnCode !== undefined && command.returnCode !== null && (
                                            <span className="text-sm text-gray-400">
                                                Exit Code: {command.returnCode}
                                            </span>
                                        )}
                                        <button
                                            onClick={() => updateCommand(command.id, { output: [], errorOutput: [], status: 'idle', returnCode: null })}
                                            className="text-gray-400 hover:text-white text-xs"
                                            title="Clear output"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>

                                <div className="border-b border-gray-600 mb-2">
                                    <div className="flex -mb-px">
                                        <button
                                            onClick={() => setActiveTab('stdout')}
                                            className={`py-2 px-4 text-sm font-medium border-b-2 ${activeTab === 'stdout' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'}`}
                                        >
                                            Output
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    {activeTab === 'stdout' && (
                                        <pre className="font-mono text-sm text-gray-300 bg-black/50 p-3 rounded-md h-48 overflow-y-auto">
                                            {command.output && command.output.length > 0 ? command.output.join('\n') : <span className="text-gray-500">No output yet...</span>}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(CommandCard);
