#include "selftest.h"
#include "main.h"
#include "app_config.h"
#include "lcd1602.h"
#include "hcsr04.h"
#include "delay_us.h"
#include <stdio.h>

extern TIM_HandleTypeDef htim3;
extern void DBG_Log(const char *fmt, ...);

typedef struct {
    GPIO_TypeDef *port;
    uint16_t pin;
    const char *name;
} Pin_t;

/* 9 LED: slot 1..3, moi slot do / vang / xanh */
static const Pin_t leds[9] = {
    { LED1_RED_GPIO_Port, LED1_RED_Pin, "LED1 DO"  }, { LED1_YELLOW_GPIO_Port, LED1_YELLOW_Pin, "LED1 VANG" }, { LED1_GREEN_GPIO_Port, LED1_GREEN_Pin, "LED1 XANH" },
    { LED2_RED_GPIO_Port, LED2_RED_Pin, "LED2 DO"  }, { LED2_YELLOW_GPIO_Port, LED2_YELLOW_Pin, "LED2 VANG" }, { LED2_GREEN_GPIO_Port, LED2_GREEN_Pin, "LED2 XANH" },
    { LED3_RED_GPIO_Port, LED3_RED_Pin, "LED3 DO"  }, { LED3_YELLOW_GPIO_Port, LED3_YELLOW_Pin, "LED3 VANG" }, { LED3_GREEN_GPIO_Port, LED3_GREEN_Pin, "LED3 XANH" },
};

static const Pin_t trig[3] = {
    { TRIG_1_GPIO_Port, TRIG_1_Pin, "TRIG1" }, { TRIG_2_GPIO_Port, TRIG_2_Pin, "TRIG2" }, { TRIG_3_GPIO_Port, TRIG_3_Pin, "TRIG3" },
};
static const Pin_t echo[3] = {
    { ECHO_1_GPIO_Port, ECHO_1_Pin, "ECHO1" }, { ECHO_2_GPIO_Port, ECHO_2_Pin, "ECHO2" }, { ECHO_3_GPIO_Port, ECHO_3_Pin, "ECHO3" },
};

static void all_leds(GPIO_PinState s)
{
    for (int i = 0; i < 9; i++) HAL_GPIO_WritePin(leds[i].port, leds[i].pin, s);
}


/* ---- Che do 2: giu tung chan o muc CAO de do bang dong ho, va hien muc ECHO ---- */
typedef struct { GPIO_TypeDef *port; uint16_t pin; const char *name; const char *where; } OutPin_t;

__attribute__((unused)) static void pin_check(void)
{
    const OutPin_t outs[] = {
        { TRIG_1_GPIO_Port, TRIG_1_Pin, "TRIG1 (PB3)",   "chan TRIG cam bien 1" },
        { TRIG_2_GPIO_Port, TRIG_2_Pin, "TRIG2 (PB13)",  "chan TRIG cam bien 2" },
        { TRIG_3_GPIO_Port, TRIG_3_Pin, "TRIG3 (PB14)",  "chan TRIG cam bien 3" },
    };
    const int n = (int)(sizeof(outs) / sizeof(outs[0]));

    DBG_Log("\r\n===== PIN CHECK: do bang dong ho (thang DC V), que den vao GND =====\r\n");
    DBG_Log("Moi chan duoc giu CAO 4 giay. Do tai dau day PHIA THIET BI: phai ~3.3V, cac chan khac ~0V.\r\n");
    DBG_Log("ECHO: cham dau day ECHO (phia cam bien) vao 3V3 cua Nucleo thi ECHOx phai doi 0 -> 1.\r\n\r\n");

    while (1) {
        for (int i = 0; i < n; i++) {
            for (int k = 0; k < n; k++) HAL_GPIO_WritePin(outs[k].port, outs[k].pin, GPIO_PIN_RESET);
            HAL_GPIO_WritePin(outs[i].port, outs[i].pin, GPIO_PIN_SET);
            DBG_Log("[PIN] %s dang CAO -> do tai %s\r\n", outs[i].name, outs[i].where);
            for (int t = 0; t < 4; t++) {
                DBG_Log("      ECHO1=%d ECHO2=%d ECHO3=%d\r\n",
                        HAL_GPIO_ReadPin(ECHO_1_GPIO_Port, ECHO_1_Pin),
                        HAL_GPIO_ReadPin(ECHO_2_GPIO_Port, ECHO_2_Pin),
                        HAL_GPIO_ReadPin(ECHO_3_GPIO_Port, ECHO_3_Pin));
                HAL_Delay(1000);
            }
        }
    }
}

/* ---- Che do 3: quet moi cap (TRIG, ECHO) trong 6 chan, tim cap nao co phan hoi ---- */
static void cfg_in(const Pin_t *p)
{
    GPIO_InitTypeDef g = {0};
    g.Pin = p->pin;
    g.Mode = GPIO_MODE_INPUT;
    g.Pull = GPIO_PULLDOWN;
    HAL_GPIO_Init(p->port, &g);
}

static void cfg_out(const Pin_t *p)
{
    GPIO_InitTypeDef g = {0};
    HAL_GPIO_WritePin(p->port, p->pin, GPIO_PIN_RESET);
    g.Pin = p->pin;
    g.Mode = GPIO_MODE_OUTPUT_PP;
    g.Pull = GPIO_NOPULL;
    g.Speed = GPIO_SPEED_FREQ_LOW;
    HAL_GPIO_Init(p->port, &g);
}

__attribute__((unused)) static void pair_scan(void)
{
    const Pin_t all[6] = { trig[0], trig[1], trig[2], echo[0], echo[1], echo[2] };
    const uint32_t cyc_per_us = SystemCoreClock / 1000000U;

    DBG_Log("\r\n===== QUET CAP TRIG/ECHO: cam bien phai dang CO NGUON 5V =====\r\n");
    DBG_Log("Cap DUNG la TRIG1->ECHO1, TRIG2->ECHO2, TRIG3->ECHO3. Khong can dat vat can.\r\n");

    while (1) {
        int hits = 0;
        for (int a = 0; a < 6; a++) {
            for (int b = 0; b < 6; b++) {
                if (a == b) continue;

                for (int k = 0; k < 6; k++) cfg_in(&all[k]);
                cfg_out(&all[a]);

                if (HAL_GPIO_ReadPin(all[b].port, all[b].pin) == GPIO_PIN_SET) {
                    DBG_Log("[WARN] %s dang o muc CAO truoc khi trigger (cham nguon?)\r\n", all[b].name);
                    continue;
                }

                HAL_GPIO_WritePin(all[a].port, all[a].pin, GPIO_PIN_SET);
                delay_us(10);
                HAL_GPIO_WritePin(all[a].port, all[a].pin, GPIO_PIN_RESET);

                uint32_t t0 = DWT_Cycles();
                uint32_t rise_limit = 1500U * cyc_per_us;
                int rose = 0;
                while ((DWT_Cycles() - t0) < rise_limit) {
                    if (HAL_GPIO_ReadPin(all[b].port, all[b].pin) == GPIO_PIN_SET) { rose = 1; break; }
                }
                if (rose) {
                    uint32_t t1 = DWT_Cycles();
                    uint32_t fall_limit = 45000U * cyc_per_us;
                    while (HAL_GPIO_ReadPin(all[b].port, all[b].pin) == GPIO_PIN_SET &&
                           (DWT_Cycles() - t1) < fall_limit) { }
                    uint32_t us = (DWT_Cycles() - t1) / cyc_per_us;
                    const char *ket_luan;
                    if (b == a + 3)      ket_luan = "DUNG CAP";
                    else if (a == b + 3) ket_luan = "TRIG va ECHO BI DOI CHO";
                    else                 ket_luan = "CHEO giua 2 cam bien";
                    DBG_Log("[HIT] TRIG=%s -> ECHO=%s | xung %lu us (%lu cm) | %s\r\n",
                            all[a].name, all[b].name, (unsigned long)us, (unsigned long)(us / 58U), ket_luan);
                    hits++;
                }
                HAL_Delay(60);
            }
        }
        DBG_Log("--- Quet xong: %d cap phan hoi (mong doi 3 cap DUNG) ---\r\n", hits);
        if (hits == 0) {
            DBG_Log("Khong cap nao phan hoi: nghi cam bien MAT NGUON 5V hoac GND, hoac day ECHO/TRIG khong toi Nucleo.\r\n");
        }
        HAL_Delay(1000);
    }
}

void Selftest_Run(void)
{
#if APP_SELFTEST == 3
    pair_scan();      /* khong quay lai */
#endif
#if APP_SELFTEST == 2
    pin_check();      /* khong quay lai */
#endif
    DBG_Log("\r\n===== SELFTEST: kiem tra tung ngoai vi =====\r\n");

    /* 1. LED: lan luot tung den 700 ms. Nhin xem den nao sang, ghi lai den nao sai */
    DBG_Log("[TEST 1/5] LED: moi den sang 700 ms theo thu tu LED1 DO, VANG, XANH, LED2..., LED3...\r\n");
    all_leds(GPIO_PIN_RESET);
    for (int i = 0; i < 9; i++) {
        HAL_GPIO_WritePin(leds[i].port, leds[i].pin, GPIO_PIN_SET);
        DBG_Log("   Dang bat: %s\r\n", leds[i].name);
        HAL_Delay(700);
        HAL_GPIO_WritePin(leds[i].port, leds[i].pin, GPIO_PIN_RESET);
    }

    /* 2. Coi */
    DBG_Log("[TEST 2/5] COI: 3 tieng bip\r\n");
    for (int i = 0; i < 3; i++) {
        HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_SET);
        HAL_Delay(150);
        HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_RESET);
        HAL_Delay(150);
    }

    /* 3. Servo: dong -> mo -> dong */
    DBG_Log("[TEST 3/5] SERVO: dong -> mo -> dong (neu khong quay: kiem tra 5V, GND chung, day PB4)\r\n");
    __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, SERVO_PULSE_CLOSED_US);
    HAL_Delay(800);
    __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, SERVO_PULSE_OPEN_US);
    HAL_Delay(1200);
    __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, SERVO_PULSE_CLOSED_US);
    HAL_Delay(800);

    /* 4. LCD */
    DBG_Log("[TEST 4/5] LCD: hien chu TEST LCD OK (neu trang: xoay bien tro V0, kiem tra RW noi GND)\r\n");
    LCD_Show("TEST LCD OK", "RS E D4-D7 OK?");
    HAL_Delay(1500);

    /* 5. Sieu am: doc lien tuc, in ra Hercules va LCD */
    DBG_Log("[TEST 5/5] SIEU AM: doc lien tuc. DAT TAY/GIAY CACH CAM BIEN 5-10 cm, so phai giam.\r\n");
    DBG_Log("   999 = cam bien chay nhung khong co vat can trong 1 m (binh thuong neu truoc mat trong)\r\n");
    DBG_Log("   998 = KHONG phan hoi (kiem tra 5V, GND, TRIG, chan ECHO)   997 = ECHO bi ket muc cao (cham nguon?)\r\n");
    for (int i = 0; i < 3; i++) {
        DBG_Log("   Muc nghi %s = %d (phai la 0 khi khong co xung)\r\n",
                echo[i].name, HAL_GPIO_ReadPin(echo[i].port, echo[i].pin));
    }
    while (1) {
        uint16_t d[3];
        for (int i = 0; i < 3; i++) {
            d[i] = HCSR04_ReadCm(trig[i].port, trig[i].pin, echo[i].port, echo[i].pin);
            HAL_Delay(60);
        }
        DBG_Log("   SR04: slot1=%u cm | slot2=%u cm | slot3=%u cm\r\n", d[0], d[1], d[2]);
        char l1[17], l2[17];
        snprintf(l1, sizeof(l1), "S1:%u S2:%u", d[0], d[1]);
        snprintf(l2, sizeof(l2), "S3:%u", d[2]);
        LCD_Show(l1, l2);
        HAL_Delay(300);
    }
}
