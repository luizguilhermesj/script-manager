import React, { useState, useEffect } from 'react';
import useCommandStore from '@lib/store';
import CommandCard from '@components/CommandCard';
import Variables from '@components/Variables';
import { PlusIcon } from '@components/Icons';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import io from 'socket.io-client';

function Dashboard() {
    const {
        commands,
        loading,
        addCommand,
        reorderCommands,
        runCommand,
        stopCommand,
        updateCommand,
        deleteCommand,
        runChain,
        setSocket,
        fetchInitialData
    } = useCommandStore();
    const [activeTab, setActiveTab] = useState('commands');

    useEffect(() => {
        const socketInitializer = async () => {
            await fetch('/api/socket');
            const socket = io();

            socket.on('connect', () => {
                console.log('connected!');
            });

            socket.on('output', (data) => {
                useCommandStore.getState().handleSocketOutput(data);
            });

            socket.on('status_update', (data) => {
                useCommandStore.getState().handleStatusUpdate(data);
            });

            socket.on('command_added', (data) => {
                useCommandStore.getState().handleCommandAdded(data);
            });

            socket.on('command_deleted', (data) => {
                useCommandStore.getState().handleCommandDeleted(data);
            });

            setSocket(socket);
        }
        socketInitializer();
        fetchInitialData();
    }, [setSocket, fetchInitialData]);

    const onDragEnd = (result) => {
        if (!result.destination) {
            return;
        }
        reorderCommands(result.source.index, result.destination.index);
    };

    if (loading) {
        return <div className="bg-gray-900 min-h-screen text-white flex items-center justify-center">Loading...</div>;
    }

    return (
        <div className="bg-gray-900 min-h-screen text-white font-sans">
            <div className="container mx-auto p-4 md:p-8">
                <header className="mb-8">
                    <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl md:text-6xl">
                        Command Chain <span className="text-indigo-400">Dashboard</span>
                    </h1>
                    <p className="mt-3 text-lg text-gray-400">
                        Visually manage, run, and chain your command-line scripts.
                    </p>
                </header>

                <div className="flex border-b border-gray-700 mb-6">
                    <button
                        onClick={() => setActiveTab('commands')}
                        className={`py-2 px-4 text-sm font-medium ${activeTab === 'commands' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Commands
                    </button>
                    <button
                        onClick={() => setActiveTab('variables')}
                        className={`py-2 px-4 text-sm font-medium ${activeTab === 'variables' ? 'border-b-2 border-indigo-500 text-white' : 'text-gray-400 hover:text-white'}`}
                    >
                        Global Variables
                    </button>
                </div>

                {activeTab === 'commands' && (
                    <>
                        <DragDropContext onDragEnd={onDragEnd}>
                            <Droppable droppableId="commands">
                                {(provided) => (
                                    <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-6">
                                        {commands.map((command, index) => (
                                            <Draggable key={command.id} draggableId={command.id} index={index}>
                                                {(provided) => (
                                                    <div
                                                        ref={provided.innerRef}
                                                        {...provided.draggableProps}
                                                        {...provided.dragHandleProps}
                                                    >
                                                        <CommandCard
                                                            command={command}
                                                            runCommand={runCommand}
                                                            stopCommand={stopCommand}
                                                            updateCommand={updateCommand}
                                                            deleteCommand={deleteCommand}
                                                            runChain={runChain}
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

                        <div className="mt-8">
                            <button
                                onClick={addCommand}
                                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                            >
                                <PlusIcon />
                                <span>Add New Command</span>
                            </button>
                        </div>
                    </>
                )}

                {activeTab === 'variables' && <Variables />}
            </div>
        </div>
    );
}

export default Dashboard;
