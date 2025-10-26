package com.codex.parsers.java.commands;

public interface PluginCommand {
    String name();

    String description();

    int execute(String[] args) throws Exception;
}

