import React, { useState, useEffect, useCallback } from 'react';
import { ChevronDownIcon, ChevronUpIcon, TrashIcon, LinkIcon } from './icons';

// A simple debounce function to prevent rapid re-renders on input change
const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
};

const ArgumentEditor = ({ argument, updateArgument, deleteArgument, commands, commandId }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [localValue, setLocalValue] = useState(argument.value);

    const debouncedUpdate = useCallback(debounce((newValue) => {
        updateArgument(argument.id, { value: newValue });
    }, 300), [argument.id, updateArgument]);

    useEffect(() => {
        setLocalValue(argument.value);
    }, [argument.value]);

    const handleValueChange = (e) => {
        setLocalValue(e.target.value);
        debouncedUpdate(e.target.value);
    };

    const handleTypeChange = (e) => {
        const newType = e.target.value;
        const updates = { type: newType };
        if (newType === 'variable') {
            updates.value = ''; // Reset value when switching to variable
        }
        updateArgument(argument.id, updates);
    };

    const renderValueInput = () => {
        switch (argument.type) {
            case 'fixed':
                return <p className="text-gray-400 italic text-sm mt-1">Value is fixed.</p>;
            case 'dropdown':
                return (
                    <select
                        value={argument.value}
                        onChange={(e) => updateArgument(argument.id, { value: e.target.value })}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 mt-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    >
                        {argument.options.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
                    </select>
                );
            case 'variable':
                 return <p className="text-indigo-400 italic text-sm mt-1">Value from command output.</p>;
            case 'editable':
            default:
                return (
                    <input
                        type="text"
                        value={localValue}
                        onChange={handleValueChange}
                        placeholder="Argument value"
                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 mt-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                    />
                );
        }
    };

    return (
        <div className={`p-3 rounded-lg mb-2 transition-all ${argument.enabled ? 'bg-gray-800' : 'bg-gray-800/50'}`}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 flex-grow">
                    <input
                        type="checkbox"
                        checked={argument.enabled}
                        onChange={(e) => updateArgument(argument.id, { enabled: e.target.checked })}
                        className="form-checkbox h-4 w-4 text-indigo-600 bg-gray-700 border-gray-600 rounded focus:ring-indigo-500"
                    />
                    <input
                        type="text"
                        value={argument.name}
                        onChange={(e) => updateArgument(argument.id, { name: e.target.value })}
                        placeholder="--argument-name"
                        className="font-mono text-sm bg-transparent focus:bg-gray-700 rounded px-1 py-0.5 w-1/3"
                    />
                </div>
                <div className="flex items-center gap-2">
                     <button onClick={() => setIsExpanded(!isExpanded)} className="text-gray-400 hover:text-white">
                        {isExpanded ? <ChevronUpIcon /> : <ChevronDownIcon />}
                    </button>
                    <button onClick={() => deleteArgument(argument.id)} className="text-red-500 hover:text-red-400">
                        <TrashIcon />
                    </button>
                </div>
            </div>

            {isExpanded && (
                <div className="mt-3 pl-6 border-l-2 border-gray-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-gray-400">Value</label>
                            {renderValueInput()}
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-gray-400">Argument Type</label>
                            <select
                                value={argument.type}
                                onChange={handleTypeChange}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 mt-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value="editable">Editable Text</option>
                                <option value="fixed">Fixed Value</option>
                                <option value="dropdown">Dropdown</option>
                                <option value="variable">From Command Output</option>
                            </select>
                        </div>
                    </div>

                    {argument.type === 'dropdown' && (
                        <div className="mt-2">
                            <label className="text-xs font-semibold text-gray-400">Dropdown Options (comma-separated)</label>
                            <input
                                type="text"
                                value={argument.options.join(',')}
                                onChange={(e) => updateArgument(argument.id, { options: e.target.value.split(',').map(s => s.trim()) })}
                                className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 mt-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    )}

                    {argument.type === 'variable' && (
                        <div className="mt-3 p-3 bg-gray-900/50 rounded-lg border border-indigo-500/30">
                            <div className="flex items-center gap-2 text-indigo-400 mb-2">
                                <LinkIcon />
                                <h4 className="font-semibold text-sm">Link to Command Output</h4>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                               <div>
                                    <label className="text-xs font-semibold text-gray-400">Source Command</label>
                                    <select
                                        value={argument.sourceCommandId || ''}
                                        onChange={(e) => updateArgument(argument.id, { sourceCommandId: e.target.value })}
                                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 mt-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    >
                                        <option value="">Select a command...</option>
                                        {commands
                                            .filter(c => c.id !== commandId) // Prevent self-dependency
                                            .map(cmd => <option key={cmd.id} value={cmd.id}>{cmd.name}</option>)}
                                    </select>
                               </div>
                               <div>
                                    <label className="text-xs font-semibold text-gray-400">Regex to Extract Value</label>
                                    <input
                                        type="text"
                                        placeholder="e.g., token: (\w+)"
                                        value={argument.regex}
                                        onChange={(e) => updateArgument(argument.id, { regex: e.target.value })}
                                        className="w-full font-mono bg-gray-700 border border-gray-600 rounded-md px-2 py-1 mt-1 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                                    />
                               </div>
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                The value for this argument will be the first capture group from the regex match on the source command's output.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default ArgumentEditor;
