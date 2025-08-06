import React, { useState, useEffect } from 'react';
import ArgumentEditor from './ArgumentEditor';
import { PlusIcon, TrashIcon, PlayIcon, StopIcon, ChevronDownIcon, ChevronUpIcon } from './icons';

const CommandCard = ({ command, updateCommand, deleteCommand, runCommand, stopCommand, commands }) => {
    const [isOutputVisible, setIsOutputVisible] = useState(true);

    // --- NEW: Effect for real-time command generation ---
    useEffect(() => {
        const generateDisplayCommand = () => {
            const generatedArgs = command.arguments
                .filter(arg => arg.enabled)
                .map(arg => {
                    if (arg.type === 'variable') {
                        const sourceCommand = commands.find(c => c.id === arg.sourceCommandId);
                        const sourceName = sourceCommand ? sourceCommand.name : '...';
                        // Use a placeholder for the display.
                        return `${arg.name} <from: '${sourceName}'>`;
                    }

                    if (arg.value) {
                        return `${arg.name} ${arg.value}`;
                    }
                    return arg.name;
                });

            const fullGeneratedCommand = `${command.executable} ${generatedArgs.join(' ')}`;

            // Only update if the command has actually changed to prevent infinite re-renders.
            if (fullGeneratedCommand !== command.generatedCommand) {
                updateCommand(command.id, { generatedCommand: fullGeneratedCommand });
            }
        };

        generateDisplayCommand();
    }, [command.arguments, command.executable, commands, command.id, updateCommand, command.generatedCommand]);


    const updateArgument = (argId, updates) => {
        const newArgs = command.arguments.map(arg =>
            arg.id === argId ? { ...arg, ...updates } : arg
        );
        updateCommand(command.id, { arguments: newArgs });
    };

    const addArgument = () => {
        const newArgs = [...command.arguments, createNewArgument()];
        updateCommand(command.id, { arguments: newArgs });
    };

    const deleteArgument = (argId) => {
        const newArgs = command.arguments.filter(arg => arg.id !== argId);
        updateCommand(command.id, { arguments: newArgs });
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

    return (
        <div className={`bg-gray-800/50 border-l-4 ${statusStyles[command.status]} rounded-lg shadow-lg mb-6`}>
            {/* Command Header */}
            <div className="p-4 border-b border-gray-700/50 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4 flex-grow">
                    <div className={`w-3 h-3 rounded-full ${statusColor[command.status].replace('text-', 'bg-')}`}></div>
                    <input
                        type="text"
                        value={command.name}
                        onChange={(e) => updateCommand(command.id, { name: e.target.value })}
                        className="text-xl font-bold bg-transparent focus:bg-gray-700 rounded-md px-2 py-1 -ml-2"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => deleteCommand(command.id)} className="text-gray-500 hover:text-red-500 transition-colors p-2 rounded-full hover:bg-gray-700">
                        <TrashIcon />
                    </button>
                    {command.status === 'running' ? (
                         <button onClick={() => stopCommand(command.id)} className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                            <StopIcon />
                            <span>Stop</span>
                        </button>
                    ) : (
                        <button onClick={() => runCommand(command.id)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg transition-colors">
                            <PlayIcon />
                            <span>Run</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Configuration Section */}
            <div className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div>
                        <label className="text-sm font-semibold text-gray-400">Executable</label>
                        <input
                            type="text"
                            value={command.executable}
                            onChange={(e) => updateCommand(command.id, { executable: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-3 py-2 mt-1 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div className="md:col-span-2">
                         <label className="text-sm font-semibold text-gray-400">Generated Command</label>
                         <div className="w-full bg-gray-900 border border-gray-600 rounded-md px-3 py-2 mt-1 font-mono text-sm text-green-400 overflow-x-auto whitespace-pre">
                            {command.generatedCommand || <span className="text-gray-500">Press 'Run' to generate...</span>}
                         </div>
                    </div>
                </div>

                <h3 className="text-lg font-semibold mb-3 text-gray-300">Arguments</h3>
                <div className="space-y-2">
                    {command.arguments.map(arg => (
                        <ArgumentEditor
                            key={arg.id}
                            argument={arg}
                            updateArgument={updateArgument}
                            deleteArgument={deleteArgument}
                            commands={commands}
                            commandId={command.id}
                        />
                    ))}
                </div>
                <button
                    onClick={addArgument}
                    className="mt-4 flex items-center gap-2 text-indigo-400 hover:text-indigo-300 font-semibold text-sm"
                >
                    <PlusIcon />
                    Add Argument
                </button>
            </div>

            {/* Output Section */}
            <div className="border-t border-gray-700/50">
                 <button onClick={() => setIsOutputVisible(!isOutputVisible)} className="w-full p-3 text-left flex justify-between items-center bg-gray-800 hover:bg-gray-700/50 transition-colors">
                    <span className="font-semibold text-gray-300">Output & Status</span>
                    {isOutputVisible ? <ChevronUpIcon /> : <ChevronDownIcon />}
                </button>
                {isOutputVisible && (
                    <div className="p-4 bg-gray-900/70">
                         <div className="flex items-center gap-2 mb-4">
                             <span className={`font-semibold ${statusColor[command.status]}`}>Status: {statusText[command.status]}</span>
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <h4 className="font-semibold text-gray-400 mb-2 border-b border-gray-600 pb-1">Standard Output</h4>
                                <pre className="font-mono text-sm text-gray-300 bg-black/50 p-3 rounded-md h-48 overflow-y-auto">
                                    {command.output.length > 0 ? command.output.join('\n') : <span className="text-gray-500">No output yet...</span>}
                                </pre>
                            </div>
                             <div>
                                <h4 className="font-semibold text-red-400 mb-2 border-b border-gray-600 pb-1">Error Output</h4>
                                <pre className="font-mono text-sm text-red-400 bg-black/50 p-3 rounded-md h-48 overflow-y-auto">
                                    {command.errorOutput.length > 0 ? command.errorOutput.join('\n') : <span className="text-gray-500">No errors yet...</span>}
                                </pre>
                            </div>
                         </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommandCard;

const createNewArgument = () => ({
    id: `arg-${Date.now()}-${Math.random()}`,
    name: '--new-arg',
    value: '',
    type: 'editable', // 'editable', 'fixed', 'dropdown', 'variable'
    options: [], // For dropdown type
    sourceCommandId: null, // For variable type
    regex: '', // For variable type
    enabled: true,
});
