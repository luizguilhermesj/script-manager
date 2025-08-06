import React from 'react';
import { Toaster } from 'react-hot-toast';
import useCommandStore from './store';
import CommandCard from './components/CommandCard';
import { PlusIcon } from './components/Icons';

function App() {
    const { commands, loading, addCommand, runCommand, stopCommand, updateCommand, deleteCommand, runChain } = useCommandStore();

    if (loading) {
        return <div className="bg-gray-900 min-h-screen text-white flex items-center justify-center">Loading...</div>;
    }

    return (
        <div className="bg-gray-900 min-h-screen text-white font-sans">
            <Toaster position="bottom-right" toastOptions={{
                className: 'bg-gray-700 text-white',
            }} />
            <div className="container mx-auto p-4 md:p-8">
                <header className="mb-8">
                    <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl">
                        Command Chain <span className="text-indigo-400">Dashboard</span>
                    </h1>
                    <p className="mt-3 text-lg text-gray-400">
                        Visually manage, run, and chain your command-line scripts.
                    </p>
                </header>

                <div className="space-y-6">
                    {commands.map(command => (
                        <CommandCard
                            key={command.id}
                            command={command}
                            commands={commands}
                            updateCommand={updateCommand}
                            deleteCommand={deleteCommand}
                            runCommand={runCommand}
                            stopCommand={stopCommand}
                            runChain={runChain}
                        />
                    ))}
                </div>

                <div className="mt-8">
                    <button
                        onClick={addCommand}
                        className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                    >
                        <PlusIcon />
                        <span>Add New Command</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export default App;
