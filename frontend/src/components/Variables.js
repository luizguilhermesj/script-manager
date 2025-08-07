import React, { useState } from 'react';
import useCommandStore from '../store';
import { PlusIcon, TrashIcon, SaveIcon } from './Icons';

const Variables = () => {
    const { variables, addVariable, updateVariable, deleteVariable } = useCommandStore();
    const [newVariableName, setNewVariableName] = useState('');
    const [newVariableValue, setNewVariableValue] = useState('');

    const handleAddVariable = () => {
        if (newVariableName.trim() && newVariableValue.trim()) {
            addVariable(newVariableName, newVariableValue);
            setNewVariableName('');
            setNewVariableValue('');
        }
    };

    return (
        <div className="p-4">
            <h2 className="text-2xl font-bold mb-4">Global Variables</h2>
            <div className="space-y-4">
                {variables.map(variable => (
                    <div key={variable.id} className="flex items-center gap-4 p-3 bg-gray-800 rounded-lg">
                        <input
                            type="text"
                            value={variable.name}
                            onChange={(e) => updateVariable(variable.id, { name: e.target.value })}
                            className="font-mono text-sm bg-gray-700 rounded px-2 py-1 w-1/3"
                        />
                        <input
                            type="text"
                            value={variable.value}
                            onChange={(e) => updateVariable(variable.id, { value: e.target.value })}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm"
                        />
                        <button onClick={() => deleteVariable(variable.id)} className="text-red-500 hover:text-red-400">
                            <TrashIcon />
                        </button>
                    </div>
                ))}
                <div className="flex items-center gap-4 p-3 bg-gray-800 rounded-lg">
                    <input
                        type="text"
                        value={newVariableName}
                        onChange={(e) => setNewVariableName(e.target.value)}
                        placeholder="New variable name"
                        className="font-mono text-sm bg-gray-700 rounded px-2 py-1 w-1/3"
                    />
                    <input
                        type="text"
                        value={newVariableValue}
                        onChange={(e) => setNewVariableValue(e.target.value)}
                        placeholder="New variable value"
                        className="w-full bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm"
                    />
                    <button onClick={handleAddVariable} className="text-green-500 hover:text-green-400">
                        <PlusIcon />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Variables;
