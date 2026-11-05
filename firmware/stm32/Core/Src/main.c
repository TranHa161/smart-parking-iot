/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Smart Parking System - STM32F401RE (Nucleo)
  *
  * Kien truc firmware: vong lap khong chan (non-blocking), moi viec la 1 task:
  *   Task_RFID     : quet the, gui RFID:<uid> len ESP32 (KHONG tu mo barrier)
  *   Task_Sensors  : do lan luot 3 sieu am, loc nhieu, cap nhat trang thai slot
  *   Task_Command  : thuc thi lenh tu ESP32 (OPEN_GATE, DENY, FEE, RESERVE...)
  *   Task_Slots    : cap nhat den LED + gui SLOTS:a,b,c khi thay doi / moi 1 s
  *   Task_Barrier  : tu dong dong barrier
  *   Task_Buzzer   : phat coi theo mau, khong chan
  *   Task_UI       : hien thi LCD theo trang thai
  *
  * Log he thong duoc gui len PC (Hercules) qua USART2 (ST-Link Virtual COM Port, 115200 8N1).
  * Giao tiep ESP32 su dung USART1 (PA9/PA10, 115200 8N1).
  * Giao thuc UART xem file docs/UART_PROTOCOL.md
  ******************************************************************************
  */
/* USER CODE END Header */

/* Includes ------------------------------------------------------------------*/
#include "main.h"

/* USER CODE BEGIN Includes */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdbool.h>
#include <stdarg.h>
#include "app_config.h"
#include "delay_us.h"
#include "lcd1602.h"
#include "mfrc522.h"
#include "hcsr04.h"
#include "selftest.h"
/* USER CODE END Includes */

/* Private variables ---------------------------------------------------------*/
SPI_HandleTypeDef hspi1;
TIM_HandleTypeDef htim3;
UART_HandleTypeDef huart1;
UART_HandleTypeDef huart2; /* USART2: Virtual COM Port len PC qua ST-Link (Hercules) */

/* USER CODE BEGIN PV */
typedef enum {
    SLOT_AVAILABLE = 0,   /* den xanh */
    SLOT_RESERVED  = 1,   /* den vang */
    SLOT_OCCUPIED  = 2    /* den do   */
} SlotStatus_t;

typedef struct {
    GPIO_TypeDef *trig_port; uint16_t trig_pin;
    GPIO_TypeDef *echo_port; uint16_t echo_pin;
    GPIO_TypeDef *red_port;  uint16_t red_pin;
    GPIO_TypeDef *yel_port;  uint16_t yel_pin;
    GPIO_TypeDef *grn_port;  uint16_t grn_pin;
} SlotHw_t;

static const SlotHw_t slot_hw[SLOT_COUNT] = {
    { TRIG_1_GPIO_Port, TRIG_1_Pin, ECHO_1_GPIO_Port, ECHO_1_Pin,
      LED1_RED_GPIO_Port, LED1_RED_Pin, LED1_YELLOW_GPIO_Port, LED1_YELLOW_Pin, LED1_GREEN_GPIO_Port, LED1_GREEN_Pin },
    { TRIG_2_GPIO_Port, TRIG_2_Pin, ECHO_2_GPIO_Port, ECHO_2_Pin,
      LED2_RED_GPIO_Port, LED2_RED_Pin, LED2_YELLOW_GPIO_Port, LED2_YELLOW_Pin, LED2_GREEN_GPIO_Port, LED2_GREEN_Pin },
    { TRIG_3_GPIO_Port, TRIG_3_Pin, ECHO_3_GPIO_Port, ECHO_3_Pin,
      LED3_RED_GPIO_Port, LED3_RED_Pin, LED3_YELLOW_GPIO_Port, LED3_YELLOW_Pin, LED3_GREEN_GPIO_Port, LED3_GREEN_Pin },
};

static SlotStatus_t slot_status[SLOT_COUNT];
static bool     slot_occupied[SLOT_COUNT];     /* ket qua cam bien sau khi loc nhieu */
static bool     slot_reserved[SLOT_COUNT];     /* co giu cho tu server              */
static uint8_t  slot_filter_cnt[SLOT_COUNT];
static bool     slots_dirty = true;            /* can cap nhat LED + gui len ESP32  */

/* UART nhan lenh tu ESP32 */
static uint8_t       rx_byte;
static char          rx_line[64];
static uint8_t       rx_len;
static char          cmd_buf[64];
static volatile bool cmd_ready = false;

/* Barrier */
static bool     barrier_open = false;
static uint32_t barrier_close_at = 0;

/* Coi */
static uint8_t  bz_left = 0;
static uint16_t bz_on_ms = 0, bz_off_ms = 0;
static bool     bz_state = false;
static uint32_t bz_next = 0;

/* Giao dien LCD */
typedef enum { UI_IDLE = 0, UI_WAIT, UI_FEE, UI_MSG } UiState_t;
static UiState_t ui_state = UI_IDLE;
static uint32_t  ui_deadline = 0;
static char      ui_l1[17], ui_l2[17];
/* USER CODE END PV */

/* Private function prototypes -----------------------------------------------*/
void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_SPI1_Init(void);
static void MX_TIM3_Init(void);
static void MX_USART1_UART_Init(void);
static void MX_USART2_UART_Init(void);

/* USER CODE BEGIN PFP */
#define TIME_REACHED(now, t)   ((int32_t)((now) - (t)) >= 0)
void DBG_Log(const char *fmt, ...);
/* USER CODE END PFP */

/* USER CODE BEGIN 0 */

/* ============================== LOG SERIAL (HERCULES) ================== */
int __io_putchar(int ch)
{
    HAL_UART_Transmit(&huart2, (uint8_t *)&ch, 1, 10);
    return ch;
}

void DBG_Log(const char *fmt, ...)
{
    char buf[128];
    va_list args;
    va_start(args, fmt);
    int len = vsnprintf(buf, sizeof(buf), fmt, args);
    va_end(args);

    if (len > 0) {
        HAL_UART_Transmit(&huart2, (uint8_t *)buf, (uint16_t)len, 50);
    }
}

/* ============================== UART ESP32 ============================= */
static void Uart_Send(const char *s)
{
    HAL_UART_Transmit(&huart1, (uint8_t *)s, (uint16_t)strlen(s), 50);
}

void HAL_UART_RxCpltCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        char c = (char)rx_byte;
        if (c == '\n' || c == '\r') {
            if (rx_len > 0) {
                rx_line[rx_len] = '\0';
                if (!cmd_ready) {
                    memcpy(cmd_buf, rx_line, (size_t)rx_len + 1);
                    cmd_ready = true;
                }
                rx_len = 0;
            }
        } else if (rx_len < sizeof(rx_line) - 1) {
            rx_line[rx_len++] = c;
        } else {
            rx_len = 0;
        }
        HAL_UART_Receive_IT(&huart1, &rx_byte, 1);
    }
}

void HAL_UART_ErrorCallback(UART_HandleTypeDef *huart)
{
    if (huart->Instance == USART1) {
        __HAL_UART_CLEAR_OREFLAG(huart);
        rx_len = 0;
        HAL_UART_Receive_IT(&huart1, &rx_byte, 1);
    }
}

/* ============================== Servo ================================== */
static void Servo_SetPulseUs(uint32_t us)
{
    __HAL_TIM_SET_COMPARE(&htim3, TIM_CHANNEL_1, us);
}

static void Barrier_Open(uint32_t now)
{
    Servo_SetPulseUs(SERVO_PULSE_OPEN_US);
    barrier_open = true;
    barrier_close_at = now + BARRIER_OPEN_MS;
    DBG_Log("[BARRIER] Mo barrier (%d ms)\r\n", BARRIER_OPEN_MS);
}

static void Task_Barrier(uint32_t now)
{
    if (barrier_open && TIME_REACHED(now, barrier_close_at)) {
        Servo_SetPulseUs(SERVO_PULSE_CLOSED_US);
        barrier_open = false;
        DBG_Log("[BARRIER] Dong barrier\r\n");
    }
}

/* ============================== Coi ==================================== */
static void Buzzer_Pattern(uint8_t beeps, uint16_t on_ms, uint16_t off_ms)
{
    bz_left = beeps;
    bz_on_ms = on_ms;
    bz_off_ms = off_ms;
    bz_state = true;
    HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_SET);
    bz_next = HAL_GetTick() + on_ms;
}

static void Task_Buzzer(uint32_t now)
{
    if (!bz_state && bz_left == 0) return;
    if (!TIME_REACHED(now, bz_next)) return;

    if (bz_state) {
        HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_RESET);
        bz_state = false;
        if (bz_left > 0) bz_left--;
        bz_next = now + bz_off_ms;
    } else if (bz_left > 0) {
        HAL_GPIO_WritePin(BUZZER_GPIO_Port, BUZZER_Pin, GPIO_PIN_SET);
        bz_state = true;
        bz_next = now + bz_on_ms;
    }
}

/* ============================== LCD UI ================================= */
static void UI_Set(UiState_t st, const char *l1, const char *l2, uint32_t duration_ms)
{
    ui_state = st;
    snprintf(ui_l1, sizeof(ui_l1), "%s", l1);
    snprintf(ui_l2, sizeof(ui_l2), "%s", l2);
    ui_deadline = HAL_GetTick() + duration_ms;
    DBG_Log("[UI] State: %d | L1: %s | L2: %s\r\n", st, l1, l2);
}

static uint8_t Count_Free_Slots(void)
{
    uint8_t n = 0;
    for (int i = 0; i < SLOT_COUNT; i++) {
        if (slot_status[i] == SLOT_AVAILABLE) n++;
    }
    return n;
}

static void Task_UI(uint32_t now)
{
    if (ui_state == UI_WAIT && TIME_REACHED(now, ui_deadline)) {
        UI_Set(UI_MSG, "SERVER TIMEOUT", "THU LAI SAU", UI_MSG_MS);
        Buzzer_Pattern(2, 100, 100);
    } else if (ui_state != UI_IDLE && ui_state != UI_WAIT && TIME_REACHED(now, ui_deadline)) {
        ui_state = UI_IDLE;
    }

    if (ui_state == UI_IDLE) {
        char l2[17];
        snprintf(l2, sizeof(l2), "SLOT TRONG: %u/%d", (unsigned)Count_Free_Slots(), SLOT_COUNT);
        LCD_Show("SMART PARKING", l2);
    } else {
        LCD_Show(ui_l1, ui_l2);
    }
}

/* ============================== Slot =================================== */
static void Update_Slot_LEDs(void)
{
    for (int i = 0; i < SLOT_COUNT; i++) {
        const SlotHw_t *h = &slot_hw[i];
        HAL_GPIO_WritePin(h->red_port, h->red_pin, slot_status[i] == SLOT_OCCUPIED  ? GPIO_PIN_SET : GPIO_PIN_RESET);
        HAL_GPIO_WritePin(h->yel_port, h->yel_pin, slot_status[i] == SLOT_RESERVED  ? GPIO_PIN_SET : GPIO_PIN_RESET);
        HAL_GPIO_WritePin(h->grn_port, h->grn_pin, slot_status[i] == SLOT_AVAILABLE ? GPIO_PIN_SET : GPIO_PIN_RESET);
    }
}

static void Slots_Recompute(void)
{
    for (int i = 0; i < SLOT_COUNT; i++) {
        SlotStatus_t s = slot_occupied[i] ? SLOT_OCCUPIED
                       : slot_reserved[i] ? SLOT_RESERVED
                                          : SLOT_AVAILABLE;
        if (s != slot_status[i]) {
            slot_status[i] = s;
            slots_dirty = true;
            DBG_Log("[SLOT] Thay doi Slot %d -> Trang thai: %d\r\n", i + 1, s);
        }
    }
}

static void Slot_Feed(int i, uint16_t dist_cm)
{
    bool target = slot_occupied[i];
    if (dist_cm <= OCCUPIED_CM)      target = true;
    else if (dist_cm >= FREE_CM)     target = false;

    if (target != slot_occupied[i]) {
        if (++slot_filter_cnt[i] >= FILTER_COUNT) {
            slot_occupied[i] = target;
            slot_filter_cnt[i] = 0;
            if (target) slot_reserved[i] = false;
            DBG_Log("[SENSOR] Xac nhan Slot %d: %s (Khoang cach: %u cm)\r\n",
                    i + 1, target ? "CO XE" : "TRONG", dist_cm);
        }
    } else {
        slot_filter_cnt[i] = 0;
    }
    Slots_Recompute();
}

static void Task_Sensors(uint32_t now)
{
    static uint32_t next = 0;
    static uint8_t  idx = 0;
    if (!TIME_REACHED(now, next)) return;
    next = now + SENSOR_PERIOD_MS;

    const SlotHw_t *h = &slot_hw[idx];
    uint16_t d = HCSR04_ReadCm(h->trig_port, h->trig_pin, h->echo_port, h->echo_pin);
    Slot_Feed(idx, d);
    idx = (uint8_t)((idx + 1) % SLOT_COUNT);
}

static void Send_Slots(void)
{
    char msg[24];
    snprintf(msg, sizeof(msg), "SLOTS:%d,%d,%d\n", slot_status[0], slot_status[1], slot_status[2]);
    Uart_Send(msg);
    DBG_Log("[TX -> ESP32] %s", msg);
}

static void Task_Slots(uint32_t now)
{
    static uint32_t next_sync = 0;
    if (slots_dirty) {
        slots_dirty = false;
        Update_Slot_LEDs();
        Send_Slots();
        next_sync = now + SYNC_PERIOD_MS;
    } else if (TIME_REACHED(now, next_sync)) {
        Send_Slots();
        next_sync = now + SYNC_PERIOD_MS;
    }
}

/* ============================== RFID =================================== */
static void Task_RFID(uint32_t now)
{
    static uint32_t next_poll = 0;
    static uint32_t lock_until = 0;

    if (!TIME_REACHED(now, next_poll)) return;
    next_poll = now + RFID_POLL_MS;
    if (!TIME_REACHED(now, lock_until)) return;

    uint8_t uid[MFRC522_UID_LEN];
    if (MFRC522_ReadUID(uid) != MFRC522_OK) return;

    lock_until = now + RFID_LOCKOUT_MS;

    char hex[9];
    snprintf(hex, sizeof(hex), "%02X%02X%02X%02X", uid[0], uid[1], uid[2], uid[3]);

    char msg[24];
    snprintf(msg, sizeof(msg), "RFID:%s\n", hex);
    Uart_Send(msg);

    DBG_Log("[RFID] Quet the thanh cong - UID: %s\r\n", hex);

    char l2[17];
    snprintf(l2, sizeof(l2), "UID:%s", hex);
    UI_Set(UI_WAIT, "DANG XU LY...", l2, SERVER_REPLY_TIMEOUT_MS);
    Buzzer_Pattern(1, 80, 0);

#if APP_OFFLINE_DEMO
    Barrier_Open(now);
#endif
}

/* ============================== Lenh tu ESP32 ========================== */
static int Parse_Slot_Index(const char *s)
{
    if (s[0] >= '1' && s[0] < ('1' + SLOT_COUNT) && s[1] == '\0') {
        return s[0] - '1';
    }
    return -1;
}

static void Process_Command(const char *cmd, uint32_t now)
{
    DBG_Log("[RX <- ESP32] Nhan lenh: %s\r\n", cmd);

    if (strncmp(cmd, "RESERVE:", 8) == 0) {
        int i = Parse_Slot_Index(cmd + 8);
        if (i >= 0 && !slot_occupied[i]) {
            slot_reserved[i] = true;
            Slots_Recompute();
        }
    }
    else if (strncmp(cmd, "CANCEL:", 7) == 0) {
        int i = Parse_Slot_Index(cmd + 7);
        if (i >= 0) {
            slot_reserved[i] = false;
            Slots_Recompute();
        }
    }
    else if (strcmp(cmd, "OPEN_GATE") == 0) {
        Barrier_Open(now);
        Buzzer_Pattern(1, 200, 0);
        UI_Set(UI_MSG, "MOI QUA CONG", "BARRIER DANG MO", BARRIER_OPEN_MS);
    }
    else if (strcmp(cmd, "DENY") == 0) {
        UI_Set(UI_MSG, "THE KHONG HOP LE", "LIEN HE BAO VE", UI_MSG_MS);
        Buzzer_Pattern(3, 100, 100);
    }
    else if (strncmp(cmd, "FEE:", 4) == 0) {
        unsigned long fee = strtoul(cmd + 4, NULL, 10);
        char l2[17];
        snprintf(l2, sizeof(l2), "%lu VND", fee);
        UI_Set(UI_FEE, "SO TIEN PHAI TRA", l2, UI_FEE_MS);
        Buzzer_Pattern(1, 80, 0);
    }
    else if (strcmp(cmd, "SYNC") == 0) {
        slots_dirty = true;
    }
}

static void Task_Command(uint32_t now)
{
    if (!cmd_ready) return;
    char local[sizeof(cmd_buf)];
    memcpy(local, cmd_buf, sizeof(local));
    cmd_ready = false;
    Process_Command(local, now);
}

/* USER CODE END 0 */

/**
  * @brief  The application entry point.
  */
int main(void)
{
    /* USER CODE BEGIN 1 */
    /* USER CODE END 1 */

    HAL_Init();
    SystemClock_Config();

    MX_GPIO_Init();
    MX_USART2_UART_Init(); /* Khoi tao USART2 truoc de in toan bo log khoi dong */
    MX_SPI1_Init();
    MX_TIM3_Init();
    MX_USART1_UART_Init();

    /* USER CODE BEGIN 2 */
    DBG_Log("\r\n==========================================\r\n");
    DBG_Log("[BOOT] STM32F401RE Smart Parking System Starting...\r\n");

    DWT_Init();

    /* Servo */
    HAL_TIM_PWM_Start(&htim3, TIM_CHANNEL_1);
    Servo_SetPulseUs(SERVO_PULSE_CLOSED_US);
    DBG_Log("[SERVO] Khoi tao PWM TIM3_CH1 - Barrier dong\r\n");

    /* LCD 1602: Thoi gian doi on dinh nguon 5V truoc khi khoi tao 4-bit */
    HAL_Delay(100);
    LCD_Init();
    LCD_Show("SMART PARKING", "KHOI DONG...");
    DBG_Log("[LCD] LCD1602 Initialized xong (Neu man sang trang: hay xoay bien tro V0)\r\n");

    /* RC522: kiem tra thanh ghi phien ban de phat hien loi day SPI */
    uint8_t ver = MFRC522_Init();
    if (ver == 0x00 || ver == 0xFF) {
        DBG_Log("[RFID] LOI KET NOI RC522 (Version doc ve: 0x%02X). Kiem tra day SPI!\r\n", ver);
        LCD_Show("RC522 LOI", "KIEM TRA DAY SPI");
        Buzzer_Pattern(3, 150, 150);
        uint32_t t = HAL_GetTick();
        while (HAL_GetTick() - t < 2000) { Task_Buzzer(HAL_GetTick()); }
    } else {
        DBG_Log("[RFID] RC522 OK - Version: 0x%02X\r\n", ver);
        char l2[17];
        snprintf(l2, sizeof(l2), "VER 0x%02X", ver);
        LCD_Show("RC522 OK", l2);
        HAL_Delay(600);
    }

	#if APP_SELFTEST
    	Selftest_Run();      /* không bao giờ quay lại */
	#endif
    /* UART nhan tu ESP32 */
    HAL_UART_Receive_IT(&huart1, &rx_byte, 1);
    Uart_Send("BOOT\n");
    DBG_Log("[ESP32] Da gui BOOT qua USART1\r\n");

    Buzzer_Pattern(1, 100, 0);
    DBG_Log("[SYSTEM] He thong san sang! Bat dau loop chinh.\r\n");
    DBG_Log("==========================================\r\n");
    /* USER CODE END 2 */

    /* Infinite loop */
    /* USER CODE BEGIN WHILE */
    while (1)
    {
        /* USER CODE END WHILE */

        /* USER CODE BEGIN 3 */
        uint32_t now = HAL_GetTick();

        Task_RFID(now);
        Task_Sensors(now);
        Task_Command(now);
        Task_Slots(now);
        Task_Barrier(now);
        Task_Buzzer(now);
        Task_UI(now);
    }
    /* USER CODE END 3 */
}

/**
  * @brief System Clock Configuration: HSI 16 MHz -> PLL -> SYSCLK 84 MHz
  */
void SystemClock_Config(void)
{
    RCC_OscInitTypeDef RCC_OscInitStruct = {0};
    RCC_ClkInitTypeDef RCC_ClkInitStruct = {0};

    __HAL_RCC_PWR_CLK_ENABLE();
    __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE2);

    RCC_OscInitStruct.OscillatorType = RCC_OSCILLATORTYPE_HSI;
    RCC_OscInitStruct.HSIState = RCC_HSI_ON;
    RCC_OscInitStruct.HSICalibrationValue = RCC_HSICALIBRATION_DEFAULT;
    RCC_OscInitStruct.PLL.PLLState = RCC_PLL_ON;
    RCC_OscInitStruct.PLL.PLLSource = RCC_PLLSOURCE_HSI;
    RCC_OscInitStruct.PLL.PLLM = 8;
    RCC_OscInitStruct.PLL.PLLN = 84;
    RCC_OscInitStruct.PLL.PLLP = RCC_PLLP_DIV2;
    RCC_OscInitStruct.PLL.PLLQ = 4;
    if (HAL_RCC_OscConfig(&RCC_OscInitStruct) != HAL_OK) {
        Error_Handler();
    }

    RCC_ClkInitStruct.ClockType = RCC_CLOCKTYPE_HCLK | RCC_CLOCKTYPE_SYSCLK
                                | RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
    RCC_ClkInitStruct.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
    RCC_ClkInitStruct.AHBCLKDivider = RCC_SYSCLK_DIV1;
    RCC_ClkInitStruct.APB1CLKDivider = RCC_HCLK_DIV2;
    RCC_ClkInitStruct.APB2CLKDivider = RCC_HCLK_DIV1;
    if (HAL_RCC_ClockConfig(&RCC_ClkInitStruct, FLASH_LATENCY_2) != HAL_OK) {
        Error_Handler();
    }
}

/**
  * @brief SPI1 Initialization: master, 5.25 MHz, mode 0 (RC522)
  */
static void MX_SPI1_Init(void)
{
    /* 1. Bật Clock cho SPI1 và GPIOA */
    __HAL_RCC_SPI1_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();

    /** SPI1 GPIO Configuration
      * PA5 ------> SPI1_SCK
      * PA6 ------> SPI1_MISO
      * PA7 ------> SPI1_MOSI
      */
    GPIO_InitTypeDef GPIO_InitStruct = {0};
    GPIO_InitStruct.Pin = GPIO_PIN_5 | GPIO_PIN_6 | GPIO_PIN_7;
    GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
    GPIO_InitStruct.Alternate = GPIO_AF5_SPI1;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    /* 2. Cấu hình ngoại vi SPI1 */
    hspi1.Instance = SPI1;
    hspi1.Init.Mode = SPI_MODE_MASTER;
    hspi1.Init.Direction = SPI_DIRECTION_2LINES;
    hspi1.Init.DataSize = SPI_DATASIZE_8BIT;
    hspi1.Init.CLKPolarity = SPI_POLARITY_LOW;
    hspi1.Init.CLKPhase = SPI_PHASE_1EDGE;
    hspi1.Init.NSS = SPI_NSS_SOFT;
    hspi1.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_16;
    hspi1.Init.FirstBit = SPI_FIRSTBIT_MSB;
    hspi1.Init.TIMode = SPI_TIMODE_DISABLE;
    hspi1.Init.CRCCalculation = SPI_CRCCALCULATION_DISABLE;
    hspi1.Init.CRCPolynomial = 10;
    if (HAL_SPI_Init(&hspi1) != HAL_OK) {
        Error_Handler();
    }
}

/**
  * @brief TIM3 Initialization: PWM 50 Hz, 1 tick = 1 us, kenh 1 (PB4) -> servo
  */
static void MX_TIM3_Init(void)
{
    TIM_ClockConfigTypeDef sClockSourceConfig = {0};
    TIM_MasterConfigTypeDef sMasterConfig = {0};
    TIM_OC_InitTypeDef sConfigOC = {0};

    htim3.Instance = TIM3;
    htim3.Init.Prescaler = 83;
    htim3.Init.CounterMode = TIM_COUNTERMODE_UP;
    htim3.Init.Period = 19999;
    htim3.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
    htim3.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
    if (HAL_TIM_Base_Init(&htim3) != HAL_OK) {
        Error_Handler();
    }
    sClockSourceConfig.ClockSource = TIM_CLOCKSOURCE_INTERNAL;
    if (HAL_TIM_ConfigClockSource(&htim3, &sClockSourceConfig) != HAL_OK) {
        Error_Handler();
    }
    if (HAL_TIM_PWM_Init(&htim3) != HAL_OK) {
        Error_Handler();
    }
    sMasterConfig.MasterOutputTrigger = TIM_TRGO_RESET;
    sMasterConfig.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;
    if (HAL_TIMEx_MasterConfigSynchronization(&htim3, &sMasterConfig) != HAL_OK) {
        Error_Handler();
    }
    sConfigOC.OCMode = TIM_OCMODE_PWM1;
    sConfigOC.Pulse = SERVO_PULSE_CLOSED_US;
    sConfigOC.OCPolarity = TIM_OCPOLARITY_HIGH;
    sConfigOC.OCFastMode = TIM_OCFAST_DISABLE;
    if (HAL_TIM_PWM_ConfigChannel(&htim3, &sConfigOC, TIM_CHANNEL_1) != HAL_OK) {
        Error_Handler();
    }
    HAL_TIM_MspPostInit(&htim3);
}

/**
  * @brief USART1 Initialization: 115200 8N1, noi voi ESP32 (PA9 TX, PA10 RX)
  */
static void MX_USART1_UART_Init(void)
{
    huart1.Instance = USART1;
    huart1.Init.BaudRate = 115200;
    huart1.Init.WordLength = UART_WORDLENGTH_8B;
    huart1.Init.StopBits = UART_STOPBITS_1;
    huart1.Init.Parity = UART_PARITY_NONE;
    huart1.Init.Mode = UART_MODE_TX_RX;
    huart1.Init.HwFlowCtl = UART_HWCONTROL_NONE;
    huart1.Init.OverSampling = UART_OVERSAMPLING_16;
    if (HAL_UART_Init(&huart1) != HAL_OK) {
        Error_Handler();
    }
}

/**
  * @brief USART2 Initialization: 115200 8N1, Virtual COM Port ST-Link (Hercules PC)
  * PA2 -> TX, PA3 -> RX
  */
static void MX_USART2_UART_Init(void)
{
    __HAL_RCC_USART2_CLK_ENABLE();

    huart2.Instance = USART2;
    huart2.Init.BaudRate = 115200;
    huart2.Init.WordLength = UART_WORDLENGTH_8B;
    huart2.Init.StopBits = UART_STOPBITS_1;
    huart2.Init.Parity = UART_PARITY_NONE;
    huart2.Init.Mode = UART_MODE_TX_RX;
    huart2.Init.HwFlowCtl = UART_HWCONTROL_NONE;
    huart2.Init.OverSampling = UART_OVERSAMPLING_16;
    if (HAL_UART_Init(&huart2) != HAL_OK) {
        Error_Handler();
    }
}

/**
  * @brief GPIO Initialization
  */
static void MX_GPIO_Init(void)
{
    GPIO_InitTypeDef GPIO_InitStruct = {0};

    __HAL_RCC_GPIOC_CLK_ENABLE();
    __HAL_RCC_GPIOH_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_GPIOB_CLK_ENABLE();

    /* Muc ra ban dau */
    HAL_GPIO_WritePin(GPIOC, LED1_YELLOW_Pin | LED1_GREEN_Pin | LED1_RED_Pin
                           | LED2_RED_Pin | LED3_YELLOW_Pin, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(RFID_RST_GPIO_Port, RFID_RST_Pin, GPIO_PIN_SET);
    HAL_GPIO_WritePin(GPIOA, LCD_D5_Pin | BUZZER_Pin | LCD_D7_Pin | LED3_RED_Pin, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(GPIOB, LCD_D6_Pin | LED3_GREEN_Pin | LED2_GREEN_Pin | TRIG_1_Pin
                           | LCD_D4_Pin | LCD_RS_Pin | LCD_EN_Pin | LED2_YELLOW_Pin
                           | TRIG_2_Pin | TRIG_3_Pin, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(RFID_SDA_GPIO_Port, RFID_SDA_Pin, GPIO_PIN_SET);

    /* Cac chan OUTPUT push-pull */
    GPIO_InitStruct.Mode = GPIO_MODE_OUTPUT_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_LOW;

    GPIO_InitStruct.Pin = LED1_YELLOW_Pin | LED1_GREEN_Pin | RFID_RST_Pin | LED1_RED_Pin
                        | LED2_RED_Pin | LED3_YELLOW_Pin;
    HAL_GPIO_Init(GPIOC, &GPIO_InitStruct);

    GPIO_InitStruct.Pin = LCD_D5_Pin | BUZZER_Pin | LCD_D7_Pin | LED3_RED_Pin;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    GPIO_InitStruct.Pin = LCD_D6_Pin | LED3_GREEN_Pin | LED2_GREEN_Pin | TRIG_1_Pin
                        | LCD_D4_Pin | RFID_SDA_Pin | LCD_RS_Pin | LCD_EN_Pin
                        | LED2_YELLOW_Pin | TRIG_2_Pin | TRIG_3_Pin;
    HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);

    /* Chan UART2 (PA2 - TX, PA3 - RX) ket noi ST-Link Virtual COM Port len PC (Hercules) */
    GPIO_InitStruct.Pin = GPIO_PIN_2 | GPIO_PIN_3;
    GPIO_InitStruct.Mode = GPIO_MODE_AF_PP;
    GPIO_InitStruct.Pull = GPIO_NOPULL;
    GPIO_InitStruct.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
    GPIO_InitStruct.Alternate = GPIO_AF7_USART2;
    HAL_GPIO_Init(GPIOA, &GPIO_InitStruct);

    /* Cac chan ECHO la INPUT (5V-tolerant: PB10, PC4, PB15). Pull-down de khong troi khi mat day */
    GPIO_InitStruct.Mode = GPIO_MODE_INPUT;
    GPIO_InitStruct.Pull = GPIO_PULLDOWN;

    GPIO_InitStruct.Pin = ECHO_2_Pin;
    HAL_GPIO_Init(ECHO_2_GPIO_Port, &GPIO_InitStruct);

    GPIO_InitStruct.Pin = ECHO_1_Pin | ECHO_3_Pin;
    HAL_GPIO_Init(GPIOB, &GPIO_InitStruct);
}

/* USER CODE BEGIN 4 */
/* USER CODE END 4 */

/**
  * @brief  Dung he thong khi co loi khoi tao.
  */
void Error_Handler(void)
{
    __disable_irq();
    while (1) { }
}

#ifdef  USE_FULL_ASSERT
void assert_failed(uint8_t *file, uint32_t line)
{
    (void)file; (void)line;
}
#endif /* USE_FULL_ASSERT */
