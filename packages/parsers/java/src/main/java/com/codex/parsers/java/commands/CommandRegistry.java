package com.codex.parsers.java.commands;

import java.util.Collections;
import java.util.List;
import java.util.Optional;

public final class CommandRegistry {
    private static final List<PluginCommand> COMMANDS = List.of(
            new ParseCommand()
    );

    private CommandRegistry() {
    }

    public static Optional<PluginCommand> find(String name) {
        return COMMANDS.stream().filter(cmd -> cmd.name().equals(name)).findFirst();
    }

    public static List<PluginCommand> list() {
        return Collections.unmodifiableList(COMMANDS);
    }
}

