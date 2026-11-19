/**
 * app_config.h - Cac tham so cau hinh cua he thong Smart Parking.
 * Chinh sua tai day khi can tinh chinh luc demo, khong sua trong main.c.
 */
#ifndef APP_CONFIG_H
#define APP_CONFIG_H

/* ---- Che do thu nghiem ------------------------------------------------- */
/* 1 = quet the la mo barrier ngay (de test phan cung khi chua co server).
 * 0 = CHE DO CHINH THUC: chi mo barrier khi nhan OPEN_GATE tu ESP32.      */
#define APP_OFFLINE_DEMO            0
#define APP_SELFTEST                0
/* ---- Cam bien sieu am -------------------------------------------------- */
#define SLOT_COUNT                  3
#define SENSOR_PERIOD_MS            60U    /* moi lan do 1 sensor, cach nhau >= 60 ms */
#define OCCUPIED_CM                 12U    /* <= nguong nay: co xe                     */
#define FREE_CM                     16U    /* >= nguong nay: het xe (co tre/hysteresis)*/
#define FILTER_COUNT                3U     /* so lan do lien tiep giong nhau moi doi   */

/* ---- Servo barrier (SG90, PWM 50 Hz, 1 tick = 1 us) --------------------- */
#define SERVO_PULSE_CLOSED_US       1000U  /* barrier dong (khoang 0 do)               */
#define SERVO_PULSE_OPEN_US         1500U  /* barrier mo   (khoang 90 do)              */
#define BARRIER_OPEN_MS             4000U  /* tu dong dong lai sau thoi gian nay       */

/* ---- RFID --------------------------------------------------------------- */
#define RFID_POLL_MS                60U    /* chu ky quet the                          */
#define RFID_LOCKOUT_MS             1500U  /* khoang nghi sau khi doc duoc 1 the        */

/* ---- Giao tiep voi ESP32 ----------------------------------------------- */
#define SYNC_PERIOD_MS              1000U  /* gui SLOTS dinh ky (heartbeat)            */
#define SERVER_REPLY_TIMEOUT_MS     5000U  /* cho server tra loi sau khi quet the       */

/* ---- Giao dien LCD ------------------------------------------------------ */
#define UI_MSG_MS                   2500U  /* thoi gian hien thong bao                 */
#define UI_FEE_MS                   60000U /* thoi gian toi da hien so tien            */

#endif /* APP_CONFIG_H */
