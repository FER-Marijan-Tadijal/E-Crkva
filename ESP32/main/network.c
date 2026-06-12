#include "network.h"

#include "esp_event.h"
#include "esp_log.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include <arpa/inet.h>
#include <errno.h>
#include <netinet/in.h>
#include <string.h>
#include <sys/socket.h>

#define WIFI_SSID "PYCOM-ECRKVA"
#define WIFI_PASS "pametnacrkva"
#define SERVER_IP "192.168.4.1"
#define SERVER_PORT 9000
#define WIFI_CONNECTED_BIT BIT0
#define LINE_BUF_LEN 128

static const char *TAG = "network";

static EventGroupHandle_t s_wifi_eg;
static int s_sock = -1;
static bool s_wifi_up = false;
static cmd_handler_t s_handler = NULL;

static void wifi_event_handler(void *arg, esp_event_base_t base, int32_t id, void *data) {
   if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
      esp_wifi_connect();
   } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
      s_wifi_up = false;
      if (s_sock >= 0) {
         close(s_sock);
         s_sock = -1;
      }
      ESP_LOGW(TAG, "WiFi prekinut, spajam...");
      esp_wifi_connect();
   } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
      s_wifi_up = true;
      xEventGroupSetBits(s_wifi_eg, WIFI_CONNECTED_BIT);
      ESP_LOGI(TAG, "WiFi spojen");
   }
}

static bool tcp_connect_to_server(void) {
   if (s_sock >= 0) {
      close(s_sock);
      s_sock = -1;
   }

   s_sock = socket(AF_INET, SOCK_STREAM, 0);
   if (s_sock < 0) {
      ESP_LOGE(TAG, "socket() neuspjelo: %d", errno);
      return false;
   }

   struct timeval tv = {.tv_sec = 5, .tv_usec = 0};
   setsockopt(s_sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

   struct sockaddr_in addr = {
       .sin_family = AF_INET,
       .sin_port = htons(SERVER_PORT),
   };
   inet_pton(AF_INET, SERVER_IP, &addr.sin_addr);

   if (connect(s_sock, (struct sockaddr *)&addr, sizeof(addr)) != 0) {
      ESP_LOGW(TAG, "TCP connect neuspjelo (%s:%d)", SERVER_IP, SERVER_PORT);
      close(s_sock);
      s_sock = -1;
      return false;
   }

   ESP_LOGI(TAG, "TCP spojen na %s:%d", SERVER_IP, SERVER_PORT);
   return true;
}

static void dispatch(const char *line) {
   if (!s_handler) return;

   char cmd[64], arg[64];
   cmd[0] = arg[0] = '\0';

   const char *sp = strchr(line, ';');
   if (sp) {
      size_t cmd_len = sp - line;
      if (cmd_len >= sizeof(cmd)) cmd_len = sizeof(cmd) - 1;
      memcpy(cmd, line, cmd_len);
      cmd[cmd_len] = '\0';
      strncpy(arg, sp + 1, sizeof(arg) - 1);
   } else {
      strncpy(cmd, line, sizeof(cmd) - 1);
   }

   s_handler(cmd, arg);
}

static void rx_task(void *arg) {
   char line[LINE_BUF_LEN];
   int line_len = 0;

   while (1) {
      if (!s_wifi_up) {
         vTaskDelay(pdMS_TO_TICKS(1000));
         continue;
      }
      if (s_sock < 0 && !tcp_connect_to_server()) {
         vTaskDelay(pdMS_TO_TICKS(5000));
         continue;
      }

      char c;
      int r = recv(s_sock, &c, 1, 0);

      if (r > 0) {
         if (c == '\n') {
            if (line_len > 0) {
               line[line_len] = '\0';
               dispatch(line);
               line_len = 0;
            }
         } else if (c != '\r' && line_len < LINE_BUF_LEN - 1) {
            line[line_len++] = c;
         }
      } else if (r == 0 || (r < 0 && errno != EAGAIN && errno != EWOULDBLOCK)) {
         ESP_LOGW(TAG, "TCP veza izgubljena, reconnect...");
         close(s_sock);
         s_sock = -1;
         line_len = 0;
         vTaskDelay(pdMS_TO_TICKS(3000));
      }
   }
}

void network_init(cmd_handler_t handler) {
   s_handler = handler;
   s_wifi_eg = xEventGroupCreate();

   esp_err_t ret = nvs_flash_init();
   if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
      ESP_ERROR_CHECK(nvs_flash_erase());
      ret = nvs_flash_init();
   }
   ESP_ERROR_CHECK(ret);

   ESP_ERROR_CHECK(esp_netif_init());
   ESP_ERROR_CHECK(esp_event_loop_create_default());
   esp_netif_create_default_wifi_sta();

   wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
   ESP_ERROR_CHECK(esp_wifi_init(&cfg));

   ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL));
   ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL));

   wifi_config_t wifi_cfg = {};
   strncpy((char *)wifi_cfg.sta.ssid, WIFI_SSID, sizeof(wifi_cfg.sta.ssid));
   strncpy((char *)wifi_cfg.sta.password, WIFI_PASS, sizeof(wifi_cfg.sta.password));

   ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
   ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_cfg));
   ESP_ERROR_CHECK(esp_wifi_start());

   ESP_LOGI(TAG, "Cekam WiFi (%s)...", WIFI_SSID);
   xEventGroupWaitBits(s_wifi_eg, WIFI_CONNECTED_BIT, false, true, pdMS_TO_TICKS(15000));

   xTaskCreate(rx_task, "net_rx", 4096, NULL, 5, NULL);
}

bool network_send(const char *msg) {
   if (s_sock < 0) return false;
   return send(s_sock, msg, strlen(msg), 0) > 0;
}
