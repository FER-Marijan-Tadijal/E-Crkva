idf_component_register(SRCS "network.c" "bell.c" "audio.c" "main.c"
                    INCLUDE_DIRS "."
                    REQUIRES esp_driver_i2s esp_wifi esp_event esp_netif nvs_flash lwip)