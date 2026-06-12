#include "esp_log.h"
#include "esp_netif_sntp.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#include "audio.h"
#include "bell.h"
#include "network.h"

static const char *TAG = "main";

// prati koji se 15-min chime zadnje odsvirao
static int s_last_ring_slot = -1;

static void on_command(const char *cmd, const char *arg) {
   if (strcmp(cmd, "/bell/ring") == 0) {
      int tone = atoi(arg);
      if (tone >= 1 && tone <= 4) bell_ring(tone);
   } else if (strcmp(cmd, "/bell/pattern") == 0) {
      // format: "15 1 2 3 4"  ili  "15, 1 2 3 4"
      char buf[128];
      strncpy(buf, arg, sizeof(buf) - 1);
      buf[sizeof(buf) - 1] = '\0';

      char *tok = strtok(buf, " ,");
      if (!tok) {
         ESP_LOGW(TAG, "/bell/pattern: nema argumenta");
         return;
      }
      int minute = atoi(tok);

      int8_t seq[64];
      int len = 0;
      tok = strtok(NULL, " ,");
      while (tok && len < 64) {
         int v = atoi(tok);
         if (v >= 0 && v <= 4) seq[len++] = (int8_t)v;
         tok = strtok(NULL, " ,");
      }
      bell_set_pattern(minute, seq, len);
   } else if (strcmp(cmd, "/bell/reset") == 0) {
      s_last_ring_slot = -1;
      bell_reset_patterns();
      ESP_LOGI(TAG, "Bell resetiran");
   } else {
      ESP_LOGW(TAG, "Nepoznata naredba: %s", cmd);
   }
}

// prati vrijeme svakih 20s i svira zvona
static void bell_task(void *arg) {
   while (1) {
      time_t now;
      struct tm t;
      time(&now);
      localtime_r(&now, &t);

      // slot_id (0-95 po danu)
      int quarter = t.tm_min / 15;
      int slot_id = t.tm_hour * 4 + quarter;
      int at_exact = (t.tm_min == 0 || t.tm_min == 15 || t.tm_min == 30 || t.tm_min == 45);

      if (at_exact && slot_id != s_last_ring_slot && t.tm_year > 70) {
         s_last_ring_slot = slot_id;
         bell_play_pattern(t.tm_min, t.tm_hour);
      }

      vTaskDelay(pdMS_TO_TICKS(20000)); // 20s
   }
}

// cita mic dB svake min i salje na Pycom
static void loudness_task(void *arg) {
   while (1) {
      if (!audio_is_playing()) {
         float db = audio_measure_db(); // ~1s citanje
         char msg[40];
         snprintf(msg, sizeof(msg), "/bell/loudness %.2f\n", db);
         ESP_LOGI(TAG, "Glasnoca: %.2f dB", db);
         network_send(msg);
      }
      // mjeranje traje ~1s, cekanje jos ~59s
      vTaskDelay(pdMS_TO_TICKS(59000)); // 59s
   }
}

void app_main(void) {
   bell_reset_patterns();
   audio_init();
   audio_calibrate();

   network_init(on_command);

   // Time sync via SNTP
   esp_sntp_config_t sntp_cfg = ESP_NETIF_SNTP_DEFAULT_CONFIG("pool.ntp.org");
   esp_netif_sntp_init(&sntp_cfg);

   ESP_LOGI(TAG, "Cekam SNTP sinkronizaciju...");
   esp_err_t sntp_ret = esp_netif_sntp_sync_wait(pdMS_TO_TICKS(10000));
   if (sntp_ret == ESP_OK) {
      // Croatia: CET UTC+1, CEST UTC+2 in summer
      setenv("TZ", "CET-1CEST,M3.5.0,M10.5.0/3", 1);
      tzset();
      time_t now;
      struct tm t;
      time(&now);
      localtime_r(&now, &t);
      ESP_LOGI(TAG, "Vrijeme: %02d:%02d:%02d", t.tm_hour, t.tm_min, t.tm_sec);
   } else {
      ESP_LOGW(TAG, "SNTP nije uspio - zvona ce raditi kad se sinkroniziraju");
   }

   xTaskCreate(bell_task, "bell", 4096, NULL, 4, NULL);
   xTaskCreate(loudness_task, "loudness", 4096, NULL, 3, NULL);

   ESP_LOGI(TAG, "Sustav pokrenut");
}
