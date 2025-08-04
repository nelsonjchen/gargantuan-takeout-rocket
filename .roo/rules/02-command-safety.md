# Command Execution Safeguard

Before executing any command that could modify the file system, install dependencies, or have other significant side effects, you **MUST** first run the `pwd` command.

This is a critical safety measure to ensure that all operations are performed within the intended project directory. This verification step prevents accidental changes in incorrect locations.

Oh, and if you change directories, remember, you had changed directories!