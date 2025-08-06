import { io } from 'socket.io-client';

const API_URL = 'http://127.0.0.1:5000';
const socket = io(API_URL);

const handleResponse = async (response) => {
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'An unknown API error occurred' }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
    }
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        return response.json();
    }
    return;
};

export const getCommands = async () => {
    const response = await fetch(`${API_URL}/commands`);
    if (!response.ok) {
        throw new Error('Failed to fetch commands');
    }
    return response.json();
};

export const updateCommand = async (command) => {
    const response = await fetch(`${API_URL}/commands/${command.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
    });
    return handleResponse(response);
};

export const runCommand = async (commandId) => {
    const response = await fetch(`${API_URL}/commands/${commandId}/run`, {
        method: 'POST',
    });
    return handleResponse(response);
};

export const stopCommand = async (commandId) => {
    const response = await fetch(`${API_URL}/commands/${commandId}/stop`, {
        method: 'POST',
    });
    return handleResponse(response);
};

export default socket;
