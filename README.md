# Script Manager

A web-based interface for managing and running command-line scripts and workflows. This tool allows you to define commands, chain them together with dependencies, and use global variables for dynamic execution.

## Features

- **Command Management:** Create, edit, and delete commands with a user-friendly interface.
- **Argument Editor:** Define arguments for your commands, including positional arguments, flags, and arguments with values.
- **Dependency Management:** Create complex workflows by defining explicit dependencies between commands.
- **Variable Substitution:** Use global variables across your commands for dynamic and reusable scripts.
- **Unified Output:** View stdout and stderr in a single, unified output stream with color-coded error highlighting.
- **Drag-and-Drop Reordering:** Easily reorder commands and arguments to fit your workflow.
- **History:** Autocomplete suggestions for previously used working directories.

## Tech Stack

- **Frontend:** React with Zustand for state management.
- **Backend:** Node.js with Express and Socket.IO.
- **Database:** SQLite.

## How to Run

1.  **Install Dependencies:**
    ```bash
    npm install
    cd frontend
    npm install
    ```

2.  **Build the Frontend:**
    ```bash
    npm run build
    ```

3.  **Start the Server:**
    ```bash
    cd ..
    npm start
    ```

The application will be available at `http://localhost:4000`.