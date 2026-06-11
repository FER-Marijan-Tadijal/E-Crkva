#pragma once

#include <stdbool.h>

typedef void (*cmd_handler_t)(const char *cmd, const char *arg);

void network_init(cmd_handler_t handler);
bool network_send(const char *msg);
