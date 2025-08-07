import React, { useState, useEffect } from 'react';
import useCommandStore from '../store';
import { TrashIcon, LinkIcon } from './Icons';

import { Draggable } from '@hello-pangea/dnd';

const ArgumentEditor = ({ argument, commandId, index }) => {
    const { commands, updateCommand } = useCommandStore();
    const [localName, setLocalName] = useState(argument.name);
    const [localValue, setLocalValue] = useState(argument.value);
    const [history, setHistory] = useState([]);

    const handleUpdateArgument = (updates) => {
        const command = commands.find(c => c.id === commandId);
        if (!command) return;

        const newArgs = command.arguments.map(arg =>
            arg.id === argument.id ? { ...arg, ...updates } : arg
        );
        updateCommand(commandId, { arguments: newArgs });
    };

    const handleDeleteArgument = () => {
        const command = commands.find(c => c.id === commandId);
        if (!command) return;

        const newArgs = command.arguments.filter(arg => arg.id !== argument.id);
        updateCommand(commandId, { arguments: newArgs });
    };

    useEffect(() => {
        setLocalName(argument.name);
        setLocalValue(argument.value);
    }, [argument.name, argument.value]);

    useEffect(() => {
        const fetchHistory = async () => {
            if (!argument.isFromOutput && localName) {
                try {
                    const response = await fetch(`/api/commands/${commandId}/arguments/${encodeURIComponent(localName)}/history`);
                    const data = await response.json();
                    setHistory(data);
                } catch (error) {
                    console.error('Error fetching argument history:', error);
                }
            }
        };
        fetchHistory();
    }, [argument.isFromOutput, commandId, localName]);

    const handleBlur = (field, value) => {
        handleUpdateArgument({ [field]: value });
    };

    return (
        <div className={`p-3 rounded-lg mb-2 transition-all ${argument.enabled ? 'bg-gray-800' : 'bg-gray-800/50'}`}>
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-grow">
                    <input
                        type="checkbox"
                        checked={argument.enabled}
                        onChange={(e) => handleUpdateArgument({ enabled: e.target.checked })}
                        className="form-checkbox h-4 w-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500"
                        title="Enable/Disable Argument"
                    />
                    
                    {!argument.isFromOutput ? (
                        <>
                            <input
                                type="text"
                                value={localName}
                                onChange={(e) => setLocalName(e.target.value)}
                                onBlur={() => handleBlur('name', localName)}
                                placeholder={argument.isPositional ? "Label" : "--arg-name"}
                                className="font-mono text-sm bg-gray-700 rounded px-2 py-1 w-1/3"
                            />
                            {!argument.isPositional && (
                                <input
                                    type="text"
                                    value={argument.joiner === undefined ? ' ' : argument.joiner}
                                    onChange={(e) => handleUpdateArgument({ joiner: e.target.value })}
                                    className="font-mono text-sm bg-gray-700 rounded px-1 py-0.5 w-8 text-center"
                                    title="Joiner character"
                                />
                            )}
                            <input
                                type="text"
                                value={localValue}
                                onChange={(e) => setLocalValue(e.target.value)}
                                onBlur={() => handleBlur('value', localValue)}
                                placeholder="Argument value"
                                list={`history-for-${argument.id}`}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                            />
                            <datalist id={`history-for-${argument.id}`}>
                                {history.map((val, i) => <option key={i} value={val} />)}
                            </datalist>
                        </>
                    ) : (
                        <>
                            <select
                                value={argument.sourceCommandId || ''}
                                onChange={(e) => handleUpdateArgument({ sourceCommandId: e.target.value })}
                                className="w-1/3 bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="">Select Source Command...</option>
                                {commands
                                    .filter(c => c.id !== commandId)
                                    .map(cmd => <option key={cmd.id} value={cmd.id}>{cmd.name}</option>)}
                            </select>
                            <input
                                type="text"
                                placeholder="Regex to Extract Value"
                                value={argument.regex}
                                onChange={(e) => handleUpdateArgument({ regex: e.target.value })}
                                className="w-full font-mono bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <label className="text-xs flex items-center gap-1 text-gray-400" title="Is this a positional argument?">
                        <input
                            type="checkbox"
                            checked={argument.isPositional || false}
                            onChange={(e) => handleUpdateArgument({ isPositional: e.target.checked })}
                            className="form-checkbox h-4 w-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500"
                        />
                        Positional
                    </label>
                    <label className="text-xs flex items-center gap-1 text-gray-400" title="Get value from the output of another command">
                        <input
                            type="checkbox"
                            checked={argument.isFromOutput || false}
                            onChange={(e) => handleUpdateArgument({ isFromOutput: e.target.checked })}
                            className="form-checkbox h-4 w-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500"
                        />
                        From Output
                    </label>
                    <button onClick={handleDeleteArgument} className="text-red-500 hover:text-red-400">
                        <TrashIcon />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ArgumentEditor;
