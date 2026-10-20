/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.c
  * @brief          : Main program body
  ******************************************************************************
  */
/* USER CODE END Header */
/* Includes ------------------------------------------------------------------*/
#include "main.h"
/* USER CODE BEGIN Includes */
#include "tm_stm32f4_mfrc522.h"
#include <ctype.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
/* USER CODE END Includes */

SPI_HandleTypeDef hspi1;
TIM_HandleTypeDef htim2;
TIM_HandleTypeDef htim5;

void SystemClock_Config(void);
static void MX_GPIO_Init(void);
static void MX_SPI1_Init(void);
static void MX_TIM2_Init(void);
static void MX_TIM5_Init(void);

/* USER CODE BEGIN 0 */
/* Wiring: see main.h. LED1..3 turn on when their slot is occupied.
 * HC-SR04: sequential 65 ms triggers, 30 ms Echo timeout, TIM5 at 1 MHz.
 * Servo: independent TIM2 CH1, 50 Hz, 500 us closed / 1500 us open.
 * Three single LEDs indicate parking-slot occupancy.
 * Console: Hercules, ST-LINK COM, 115200 8N1, add <10 HEX> followed by CR/LF.
 * Added cards live in RAM only. PA9/PA10 remain available for future Wi-Fi.
 */
/* RC522 implementation is kept here because this project has no RC522 .c file.
 * Register definitions and original library attribution are in tm_stm32f4_mfrc522.h.
 * TM_MFRC522_Check() returns the 5-byte card ID (4 UID bytes + BCC) like the TM library.
 */
static uint8_t rfid_io_error;
static uint8_t rfid_ready;

static void RC522_Write(uint8_t address, uint8_t value)
{
    uint8_t tx[2] = {(uint8_t)((address << 1U) & 0x7EU), value};
    uint8_t rx[2];
    if (rfid_io_error) return;
    MFRC522_CS_LOW;
    if (HAL_SPI_TransmitReceive(&hspi1, tx, rx, 2U, 5U) != HAL_OK) rfid_io_error = 1U;
    MFRC522_CS_HIGH;
}

static uint8_t RC522_Read(uint8_t address)
{
    uint8_t tx[2] = {(uint8_t)(((address << 1U) & 0x7EU) | 0x80U), 0U};
    uint8_t rx[2] = {0};
    if (rfid_io_error) return 0U;
    MFRC522_CS_LOW;
    if (HAL_SPI_TransmitReceive(&hspi1, tx, rx, 2U, 5U) != HAL_OK) rfid_io_error = 1U;
    MFRC522_CS_HIGH;
    return rx[1];
}

static void RC522_Mask(uint8_t address, uint8_t mask, uint8_t set)
{
    uint8_t value = RC522_Read(address);
    RC522_Write(address, set ? (uint8_t)(value | mask) : (uint8_t)(value & ~mask));
}

static uint8_t RC522_CRC(const uint8_t *data, uint8_t length, uint8_t crc[2])
{
    RC522_Write(MFRC522_REG_COMMAND, PCD_IDLE);
    RC522_Write(MFRC522_REG_DIV_IRQ, 0x04U);
    RC522_Write(MFRC522_REG_FIFO_LEVEL, 0x80U);
    for (uint8_t i = 0; i < length; ++i) RC522_Write(MFRC522_REG_FIFO_DATA, data[i]);
    RC522_Write(MFRC522_REG_COMMAND, PCD_CALCCRC);
    uint32_t started = HAL_GetTick();
    while (!(RC522_Read(MFRC522_REG_DIV_IRQ) & 0x04U)) {
        if (rfid_io_error || (uint32_t)(HAL_GetTick() - started) >= 5U) {
            RC522_Write(MFRC522_REG_COMMAND, PCD_IDLE);
            return 0U;
        }
    }
    RC522_Write(MFRC522_REG_COMMAND, PCD_IDLE);
    crc[0] = RC522_Read(MFRC522_REG_CRC_RESULT_L);
    crc[1] = RC522_Read(MFRC522_REG_CRC_RESULT_M);
    return !rfid_io_error;
}

static TM_MFRC522_Status_t RC522_Exchange(const uint8_t *tx, uint8_t tx_length,
                                        uint8_t tx_bits, uint8_t *rx,
                                        uint8_t capacity, uint16_t *rx_bits)
{
    *rx_bits = 0U;
    RC522_Write(MFRC522_REG_COMMAND, PCD_IDLE);
    RC522_Write(MFRC522_REG_COMM_IRQ, 0x7FU);
    RC522_Write(MFRC522_REG_FIFO_LEVEL, 0x80U);
    RC522_Write(MFRC522_REG_BIT_FRAMING, tx_bits);
    for (uint8_t i = 0; i < tx_length; ++i) RC522_Write(MFRC522_REG_FIFO_DATA, tx[i]);
    RC522_Write(MFRC522_REG_COMMAND, PCD_TRANSCEIVE);
    RC522_Mask(MFRC522_REG_BIT_FRAMING, 0x80U, 1U);
    uint8_t irq;
    uint32_t started = HAL_GetTick();
    do {
        irq = RC522_Read(MFRC522_REG_COMM_IRQ);
        if (rfid_io_error || (uint32_t)(HAL_GetTick() - started) >= 30U) {
            RC522_Write(MFRC522_REG_COMMAND, PCD_IDLE);
            RC522_Mask(MFRC522_REG_BIT_FRAMING, 0x80U, 0U);
            return MI_ERR;
        }
    } while (!(irq & 0x31U));
    RC522_Mask(MFRC522_REG_BIT_FRAMING, 0x80U, 0U);
    RC522_Write(MFRC522_REG_COMMAND, PCD_IDLE);
    if (irq & 0x01U) return MI_NOTAGERR;
    if (RC522_Read(MFRC522_REG_ERROR) & 0x1BU) return MI_ERR;
    uint8_t count = RC522_Read(MFRC522_REG_FIFO_LEVEL);
    uint8_t last_bits = RC522_Read(MFRC522_REG_CONTROL) & 0x07U;
    /* Reject oversized responses before touching the caller's buffer. */
    if (!count || count > capacity) return MI_ERR;
    *rx_bits = last_bits ? (uint16_t)((count - 1U) * 8U + last_bits) : (uint16_t)(count * 8U);
    for (uint8_t i = 0; i < count; ++i) rx[i] = RC522_Read(MFRC522_REG_FIFO_DATA);
    return rfid_io_error ? MI_ERR : MI_OK;
}

uint8_t TM_MFRC522_Init(void)
{
    rfid_io_error = 0U;
    MFRC522_CS_HIGH;
    HAL_GPIO_WritePin(RFID_RST_GPIO_Port, RFID_RST_Pin, GPIO_PIN_RESET);
    HAL_Delay(2U);
    HAL_GPIO_WritePin(RFID_RST_GPIO_Port, RFID_RST_Pin, GPIO_PIN_SET);
    HAL_Delay(50U);
    RC522_Write(MFRC522_REG_COMMAND, PCD_RESETPHASE);
    HAL_Delay(50U);
    uint32_t started = HAL_GetTick();
    while (RC522_Read(MFRC522_REG_COMMAND) & 0x10U) {
        if (rfid_io_error || (uint32_t)(HAL_GetTick() - started) >= 50U) return 0U;
    }
    uint8_t version = RC522_Read(MFRC522_REG_VERSION);
    if (rfid_io_error || version == 0U || version == 0xFFU) return 0U;
    RC522_Write(MFRC522_REG_T_MODE, 0x80U);
    RC522_Write(MFRC522_REG_T_PRESCALER, 0xA9U);
    RC522_Write(MFRC522_REG_T_RELOAD_H, 0x03U);
    RC522_Write(MFRC522_REG_T_RELOAD_L, 0xE8U); /* 25 ms receive timeout. */
    RC522_Write(MFRC522_REG_TX_MODE, 0U);
    RC522_Write(MFRC522_REG_RX_MODE, 0U);
    RC522_Write(MFRC522_REG_RF_CFG, 0x70U);
    RC522_Write(MFRC522_REG_TX_AUTO, 0x40U);
    RC522_Write(MFRC522_REG_MODE, 0x3DU);
    RC522_Mask(MFRC522_REG_TX_CONTROL, 0x03U, 1U);
    return !rfid_io_error;
}

/* Same flow as the original TM library (lab sheet 3.8):
 * TM_MFRC522_Request(PICC_REQIDL) -> TM_MFRC522_Anticoll() -> TM_MFRC522_Halt().
 * On MI_OK, uid[0..4] holds the 5-byte card ID (4 UID bytes + BCC).
 */
TM_MFRC522_Status_t TM_MFRC522_Check(uint8_t *uid)
{
    uint8_t request = PICC_REQIDL;
    uint8_t response[5] = {0};
    uint16_t bits;
    rfid_io_error = 0U;
    /* Request: card must answer with a 16-bit ATQA. */
    TM_MFRC522_Status_t status = RC522_Exchange(&request, 1U, 7U, response, 2U, &bits);
    if (status == MI_OK && bits != 16U) status = MI_ERR;
    uint8_t card_answered = (status == MI_OK);
    /* Anticoll: read 4 UID bytes + BCC and verify the XOR checksum. */
    if (status == MI_OK) {
        uint8_t anticoll[2] = {PICC_ANTICOLL, 0x20U};
        RC522_Mask(MFRC522_REG_COLL, 0x80U, 0U);
        status = RC522_Exchange(anticoll, 2U, 0U, response, 5U, &bits);
        if (status == MI_OK && (bits != 40U ||
            (uint8_t)(response[0] ^ response[1] ^ response[2] ^ response[3]) != response[4])) {
            status = MI_ERR;
        }
    }
    /* Halt: sent and its result ignored, like the TM library. Skipped when no card
     * answered the Request, to avoid another 25 ms blocking wait on empty polls. */
    if (card_answered) {
        uint8_t halt[4] = {PICC_HALT, 0U, 0U, 0U};
        uint8_t dummy[2];
        if (RC522_CRC(halt, 2U, &halt[2])) (void)RC522_Exchange(halt, 4U, 0U, dummy, sizeof(dummy), &bits);
    }
    if (status == MI_OK) memcpy(uid, response, 5U);
    return status;
}

/* APP_LOGIC_BEGIN */
#define SENSOR_COUNT           3U
#define OCCUPIED_DISTANCE_CM   5U
#define TRIGGER_INTERVAL_MS    65U
#define ECHO_TIMEOUT_US        30000U
#define SENSOR_STALE_MS        600U
#define SERVO_OPEN_MS          4500U
#define SERVO_TEST_MIN_US      1200U
#define SERVO_TEST_CENTER_US   1500U
#define SERVO_TEST_MAX_US      1800U
#define BUTTON_DEBOUNCE_MS     40U
#define DENIED_WAIT_MS         1500U
#define RFID_POLL_MS           100U /* Same as HAL_Delay(100) in the lab sheet loop. */
#define RFID_REMOVE_MISSES     3U   /* Consecutive misses before a card counts as removed. */
#define MAX_CARDS              10U
#define CARD_BYTES             5U
#define RX_BUF_SIZE            60U


typedef struct {
    GPIO_TypeDef *trig_port;
    uint16_t trig_pin;
    GPIO_TypeDef *echo_port;
    uint16_t echo_pin;
    GPIO_TypeDef *led_port;
    uint16_t led_pin;
} SensorPins;

typedef enum { ECHO_IDLE, ECHO_WAIT_RISE, ECHO_WAIT_FALL, ECHO_DONE } EchoState;
typedef struct {
    volatile EchoState state;
    volatile uint32_t triggered_us;
    volatile uint32_t rising_us;
    volatile uint32_t width_us;
    uint32_t updated_ms;
    uint16_t distance_cm;
    uint8_t valid;
    uint8_t occupied;
} Sensor;

typedef enum { DOOR_IDLE, DOOR_CHECK, DOOR_OPEN, DOOR_DENIED } DoorState;
typedef enum { ACCESS_ALLOWED, ACCESS_FULL, ACCESS_INVALID, ACCESS_UNKNOWN } Access;

static const SensorPins sensor_pins[SENSOR_COUNT] = {
    {TRIG1_GPIO_Port, TRIG1_Pin, ECHO1_GPIO_Port, ECHO1_Pin, LED1_GPIO_Port, LED1_Pin},
    {TRIG2_GPIO_Port, TRIG2_Pin, ECHO2_GPIO_Port, ECHO2_Pin, LED2_GPIO_Port, LED2_Pin},
    {TRIG3_GPIO_Port, TRIG3_Pin, ECHO3_GPIO_Port, ECHO3_Pin, LED3_GPIO_Port, LED3_Pin}
};
static const uint8_t default_cards[4][CARD_BYTES] = {
    {0x56, 0x62, 0x2E, 0x02, 0x18},
    {0xF0, 0x94, 0xD8, 0x5C, 0xE0},
    {0x40, 0x27, 0xC4, 0x41, 0xE2},
    {0xA4, 0x73, 0xC4, 0x41, 0x52}
};
static uint8_t allowed_cards[MAX_CARDS][CARD_BYTES];
static uint8_t card_count;
static uint8_t card_present, card_misses, last_card_id[CARD_BYTES];
static Sensor sensors[SENSOR_COUNT]; /* Inspect sensors[] in the debugger. */
static uint8_t next_sensor;
static uint32_t last_trigger_ms, last_rfid_ms, last_log_ms, door_started_ms;
static DoorState door_state;
static Access pending_access;
static char rx_buffer[RX_BUF_SIZE];
static volatile uint16_t rx_index;
static volatile uint8_t command_ready, rx_overflow, command_overflow;
static GPIO_PinState button_raw, button_stable;
static uint32_t button_changed_ms;
static uint8_t button_armed, servo_test_next;
static uint16_t servo_test_pulse_us; /* Current requested pulse, visible in debugger. */

static uint32_t Micros(void)
{
    return __HAL_TIM_GET_COUNTER(&htim5);
}

static void DelayUs(uint32_t us)
{
    uint32_t start = Micros();
    /* Unsigned subtraction handles TIM5's 32-bit wrap. Never reset TIM2/TIM5. */
    while ((uint32_t)(Micros() - start) < us) { }
}


/* USART2 uses the CMSIS registers already present in this project.
 * This keeps the ST-LINK console without adding HAL UART .c/.h files.
 * PA2 TX / PA3 RX, 115200 baud, 8 data bits, no parity, 1 stop bit.
 */
static void Console_Init(void)
{
    GPIO_InitTypeDef gpio = {0};
    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_USART2_CLK_ENABLE();
    __HAL_RCC_USART2_FORCE_RESET();
    __HAL_RCC_USART2_RELEASE_RESET();
    gpio.Pin = GPIO_PIN_2 | GPIO_PIN_3;
    gpio.Mode = GPIO_MODE_AF_PP;
    gpio.Pull = GPIO_PULLUP;
    gpio.Speed = GPIO_SPEED_FREQ_VERY_HIGH;
    gpio.Alternate = GPIO_AF7_USART2;
    HAL_GPIO_Init(GPIOA, &gpio);
    USART2->CR1 = 0U;
    USART2->CR2 = 0U;
    USART2->CR3 = 0U;
    USART2->BRR = (HAL_RCC_GetPCLK1Freq() + 57600U) / 115200U;
    USART2->CR1 = USART_CR1_UE | USART_CR1_TE | USART_CR1_RE | USART_CR1_RXNEIE;
    HAL_NVIC_SetPriority(USART2_IRQn, 2U, 0U);
    HAL_NVIC_EnableIRQ(USART2_IRQn);
}

static void Console_Send(const char *data, uint16_t length)
{
    uint32_t start = HAL_GetTick();
    for (uint16_t i = 0; i < length; ++i) {
        while (!(USART2->SR & USART_SR_TXE)) {
            if ((uint32_t)(HAL_GetTick() - start) >= 30U) return;
        }
        USART2->DR = (uint8_t)data[i];
    }
}

void Console_IRQHandler(void)
{
    uint32_t status = USART2->SR;
    if (!(status & (USART_SR_RXNE | USART_SR_ORE | USART_SR_FE | USART_SR_NE | USART_SR_PE))) return;
    /* Reading SR then DR clears the received byte and receive error flags. */
    uint8_t byte = (uint8_t)USART2->DR;
    if (status & (USART_SR_ORE | USART_SR_FE | USART_SR_NE | USART_SR_PE)) {
        if (!command_ready) rx_overflow = 1U;
        return;
    }
    if (command_ready) return; /* One command at a time: wait for its reply. */
    if (byte == '\r' || byte == '\n') {
        if (rx_index || rx_overflow) {
            rx_buffer[rx_index] = '\0';
            command_overflow = rx_overflow;
            command_ready = 1U;
        }
    } else if (!rx_overflow) {
        if (rx_index < RX_BUF_SIZE - 1U) rx_buffer[rx_index++] = (char)byte;
        else rx_overflow = 1U;
    }
}

static void Log(const char *format, ...)
{
    char message[192];
    va_list args;
    va_start(args, format);
    int length = vsnprintf(message, sizeof(message), format, args);
    va_end(args);
    if (length > 0) {
        if ((size_t)length >= sizeof(message)) length = sizeof(message) - 1;
        Console_Send(message, (uint16_t)length);
    }
}

static void ServoSet(uint8_t angle)
{
    if (angle > 180U) angle = 180U;
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, 500U + (angle * 2000U) / 180U);
}

/* Test with the horn unloaded: SG90 travel limits vary between units. */
static void ServoTestSetPulse(uint16_t pulse_us)
{
    if (pulse_us < SERVO_TEST_MIN_US) pulse_us = SERVO_TEST_MIN_US;
    if (pulse_us > SERVO_TEST_MAX_US) pulse_us = SERVO_TEST_MAX_US;
    servo_test_pulse_us = pulse_us;
    __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, pulse_us);
    Log("SERVO TEST: pulse=%u us, PWM=50 Hz\r\n", (unsigned)pulse_us);
}

static void ServoTestInit(void)
{
    /* NUCLEO-F401RE B1 is active low; a button held at boot must be released. */
    button_raw = HAL_GPIO_ReadPin(USER_BUTTON_GPIO_Port, USER_BUTTON_Pin);
    button_stable = button_raw;
    button_changed_ms = HAL_GetTick();
    button_armed = (button_stable == GPIO_PIN_SET);
    servo_test_next = 0U;
    ServoTestSetPulse(SERVO_TEST_CENTER_US);
    Log("SERVO TEST: bam/tha B1 (USER xanh, PC13): 1200 -> 1500 -> 1800 us.\r\n"
        "RFID chi doc UID trong che do test.\r\n");
}

static void ServoButtonProcess(uint32_t now)
{
    static const uint16_t pulses[] = {
        SERVO_TEST_MIN_US, SERVO_TEST_CENTER_US, SERVO_TEST_MAX_US
    };
    GPIO_PinState raw = HAL_GPIO_ReadPin(USER_BUTTON_GPIO_Port, USER_BUTTON_Pin);
    if (raw != button_raw) {
        button_raw = raw;
        button_changed_ms = now;
    }
    if (raw == button_stable || (uint32_t)(now - button_changed_ms) < BUTTON_DEBOUNCE_MS) return;
    button_stable = raw;
    if (button_stable == GPIO_PIN_SET) {
        button_armed = 1U;
    } else if (button_armed) {
        button_armed = 0U;
        ServoTestSetPulse(pulses[servo_test_next]);
        servo_test_next = (uint8_t)((servo_test_next + 1U) % (sizeof(pulses) / sizeof(pulses[0])));
    }
}

void HAL_GPIO_EXTI_Callback(uint16_t pin)
{
    for (uint8_t i = 0; i < SENSOR_COUNT; ++i) {
        Sensor *sensor = &sensors[i];
        if (pin != sensor_pins[i].echo_pin) continue;
        /* Ignore idle/startup edges before TIM5 has been initialized. */
        if (sensor->state != ECHO_WAIT_RISE && sensor->state != ECHO_WAIT_FALL) return;
        uint32_t now = Micros();
        if ((uint32_t)(now - sensor->triggered_us) >= ECHO_TIMEOUT_US) return;
        GPIO_PinState level = HAL_GPIO_ReadPin(sensor_pins[i].echo_port, pin);
        if (level == GPIO_PIN_SET && sensor->state == ECHO_WAIT_RISE) {
            sensor->rising_us = now;
            sensor->state = ECHO_WAIT_FALL;
        } else if (level == GPIO_PIN_RESET && sensor->state == ECHO_WAIT_FALL) {
            sensor->width_us = (uint32_t)(now - sensor->rising_us);
            sensor->state = ECHO_DONE;
        }
        return;
    }
}

static void SensorsProcess(uint32_t now)
{
    for (uint8_t i = 0; i < SENSOR_COUNT; ++i) {
        Sensor *sensor = &sensors[i];
        uint8_t complete = 0U, timed_out = 0U;
        uint32_t width = 0U;
        uint32_t irq_mask = __get_PRIMASK();
        __disable_irq();
        if (sensor->state == ECHO_DONE) {
            width = sensor->width_us;
            complete = 1U;
            sensor->state = ECHO_IDLE;
        } else if (sensor->state != ECHO_IDLE &&
                   (uint32_t)(Micros() - sensor->triggered_us) >= ECHO_TIMEOUT_US) {
            sensor->state = ECHO_IDLE;
            timed_out = 1U;
        }
        __set_PRIMASK(irq_mask);
        if (complete) {
            /* Bound before multiplication, including malformed/stale edges. */
            uint32_t cm = (width < ECHO_TIMEOUT_US) ? (width * 343U) / 20000U : 0U;
            /* Match the original accepted range (>2 cm, <400 cm). */
            sensor->valid = (cm > 2U && cm < 400U);
            sensor->updated_ms = now;
            if (sensor->valid) {
                sensor->distance_cm = (uint16_t)cm;
                sensor->occupied = (cm <= OCCUPIED_DISTANCE_CM);
            }
        }
        if (timed_out || (uint32_t)(now - sensor->updated_ms) >= SENSOR_STALE_MS) {
            sensor->valid = 0U;
        }
        /* On failure retain the last occupancy, but do not count an unknown slot as free. */
        HAL_GPIO_WritePin(sensor_pins[i].led_port, sensor_pins[i].led_pin,
                          sensor->occupied ? GPIO_PIN_SET : GPIO_PIN_RESET);
    }
    if ((uint32_t)(now - last_trigger_ms) >= TRIGGER_INTERVAL_MS) {
        uint8_t i = next_sensor;
        next_sensor = (next_sensor + 1U) % SENSOR_COUNT;
        last_trigger_ms = now;
        HAL_GPIO_WritePin(sensor_pins[i].trig_port, sensor_pins[i].trig_pin, GPIO_PIN_RESET);
        DelayUs(2U);
        uint32_t irq_mask = __get_PRIMASK();
        __disable_irq();
        __HAL_GPIO_EXTI_CLEAR_IT(sensor_pins[i].echo_pin);
        sensors[i].triggered_us = Micros();
        sensors[i].state = ECHO_WAIT_RISE;
        __set_PRIMASK(irq_mask);
        HAL_GPIO_WritePin(sensor_pins[i].trig_port, sensor_pins[i].trig_pin, GPIO_PIN_SET);
        DelayUs(12U);
        HAL_GPIO_WritePin(sensor_pins[i].trig_port, sensor_pins[i].trig_pin, GPIO_PIN_RESET);
    }
}

static uint8_t CardAllowed(const uint8_t *uid)
{
    for (uint8_t i = 0; i < card_count; ++i) {
        if (memcmp(uid, allowed_cards[i], CARD_BYTES) == 0) return 1U;
    }
    return 0U;
}

static void CommandProcess(void)
{
    if (!command_ready) return;
    char input[RX_BUF_SIZE];
    uint32_t irq_mask = __get_PRIMASK();
    __disable_irq();
    memcpy(input, rx_buffer, sizeof(input));
    uint8_t overflow = command_overflow;
    rx_index = 0U;
    rx_overflow = command_overflow = command_ready = 0U;
    __set_PRIMASK(irq_mask);
    if (overflow) {
        Log("[SYSTEM] ERROR: Lenh qua dai/loi UART. Gui lai ca dong.\r\n");
        return;
    }
    char *command = strtok(input, " \t\r\n");
    if (!command) return;
    for (char *p = command; *p; ++p) *p = (char)tolower((unsigned char)*p);
    char *hex = strtok(NULL, " \t\r\n");
    if (strcmp(command, "add") || !hex || strlen(hex) != CARD_BYTES * 2U ||
        strtok(NULL, " \t\r\n")) {
        Log("[SYSTEM] ERROR: Dung add <10 ky tu HEX>, vi du add A473C44152\r\n");
        return;
    }
    for (uint8_t i = 0; i < CARD_BYTES * 2U; ++i) {
        if (!isxdigit((unsigned char)hex[i])) {
            Log("[SYSTEM] ERROR: Ma the phai du 10 ky tu HEX.\r\n");
            return;
        }
    }
    uint8_t uid[CARD_BYTES];
    for (uint8_t i = 0; i < CARD_BYTES; ++i) {
        char pair[3] = {hex[2U * i], hex[2U * i + 1U], '\0'};
        uid[i] = (uint8_t)strtoul(pair, NULL, 16);
    }
    if (CardAllowed(uid)) Log("[SYSTEM] WARNING: The da ton tai.\r\n");
    else if (card_count >= MAX_CARDS) Log("[SYSTEM] ERROR: Bo nho the da day.\r\n");
    else {
        memcpy(allowed_cards[card_count++], uid, CARD_BYTES);
        Log("[SYSTEM] SUCCESS: Da add the %s (%u/%u), luu trong RAM.\r\n",
            hex, (unsigned)card_count, (unsigned)MAX_CARDS);
    }
}

static void SlotCounts(uint8_t *occupied, uint8_t *free_slots, uint8_t *valid_mask)
{
    *occupied = *free_slots = *valid_mask = 0U;
    for (uint8_t i = 0; i < SENSOR_COUNT; ++i) {
        *occupied += sensors[i].occupied;
        if (sensors[i].valid) {
            *valid_mask |= (uint8_t)(1U << i);
            *free_slots += !sensors[i].occupied;
        }
    }
}

static void DoorProcess(uint32_t now)
{
    switch (door_state) {
    case DOOR_CHECK:
        if (pending_access == ACCESS_ALLOWED) {
            uint8_t occupied, free_slots, valid_mask;
            SlotCounts(&occupied, &free_slots, &valid_mask);
            if (occupied >= SENSOR_COUNT) pending_access = ACCESS_FULL;
            else if (!free_slots) pending_access = ACCESS_UNKNOWN;
        }
        if (pending_access == ACCESS_ALLOWED) {
            ServoSet(90U);
            door_started_ms = now;
            door_state = DOOR_OPEN;
            Log("Ket qua: THE HOP LE. Mo cua 4.5 giay!\r\n");
        } else {
            if (pending_access == ACCESS_FULL) Log("Ket qua: TU CHOI! Bai xe day (%u/%u).\r\n", SENSOR_COUNT, SENSOR_COUNT);
            else if (pending_access == ACCESS_UNKNOWN) Log("Ket qua: TU CHOI! Chua xac nhan duoc cho trong (loi/chua do cam bien).\r\n");
            else Log("Ket qua: THE KHONG HOP LE. Tu choi!\r\n");
            door_started_ms = now;
            door_state = DOOR_DENIED;
        }
        break;
    case DOOR_OPEN:
        if ((uint32_t)(now - door_started_ms) >= SERVO_OPEN_MS) {
            ServoSet(0U);
            door_state = DOOR_IDLE;
            Log("Da dong cua.\r\n");
        }
        break;
    case DOOR_DENIED:
        if ((uint32_t)(now - door_started_ms) >= DENIED_WAIT_MS) door_state = DOOR_IDLE;
        break;
    case DOOR_IDLE:
        break; /* Cards are read in RfidProcess(). */
    }
}

/* Same logic as lab sheet 3.8:
 *   HAL_Delay(100);
 *   if (TM_MFRC522_Check(CardID) == MI_OK) -> "Card found" + 5-byte card ID
 *   else                                   -> "----------"
 * The OLED version redraws every 100 ms; on Hercules each line is printed once per
 * change (card tapped / card removed) so the terminal is not flooded.
 */
static void RfidProcess(uint32_t now)
{
    if (!rfid_ready || (uint32_t)(now - last_rfid_ms) < RFID_POLL_MS) return;
    last_rfid_ms = now;
    uint8_t card_id[MFRC522_MAX_LEN] = {0};
    if (TM_MFRC522_Check(card_id) == MI_OK) {
        card_misses = 0U;
        /* Same card still on the reader: already printed, do nothing. */
        if (card_present && memcmp(card_id, last_card_id, CARD_BYTES) == 0) return;
        card_present = 1U;
        memcpy(last_card_id, card_id, CARD_BYTES);
        Log("Card found! UID: %02X%02X%02X%02X%02X\r\n",
            card_id[0], card_id[1], card_id[2], card_id[3], card_id[4]);
        if (SERVO_TEST_MODE) return; /* Only B1 controls the servo during this test. */
        if (door_state != DOOR_IDLE) {
            Log("He thong dang xu ly, rut the ra va quet lai.\r\n");
            return;
        }
        uint8_t occupied, free_slots, valid_mask;
        SlotCounts(&occupied, &free_slots, &valid_mask);
        if (occupied >= SENSOR_COUNT) pending_access = ACCESS_FULL;
        else if (!CardAllowed(card_id)) pending_access = ACCESS_INVALID;
        else if (!free_slots) pending_access = ACCESS_UNKNOWN;
        else pending_access = ACCESS_ALLOWED;
        door_state = DOOR_CHECK;
    } else if (card_present && ++card_misses >= RFID_REMOVE_MISSES) {
        card_present = 0U;
        Log("----------\r\n");
    }
}

static void Parking_Init(void)
{
    memset(sensors, 0, sizeof(sensors));
    memset(allowed_cards, 0, sizeof(allowed_cards));
    memcpy(allowed_cards, default_cards, sizeof(default_cards));
    card_count = 4U;
    rx_index = 0U;
    command_ready = rx_overflow = command_overflow = 0U;
    next_sensor = 0U;
    door_state = DOOR_IDLE;
    card_present = card_misses = 0U;
    Console_Init();
    if (SERVO_TEST_MODE) {
        __HAL_TIM_SET_COMPARE(&htim2, TIM_CHANNEL_1, SERVO_TEST_CENTER_US);
    } else {
        ServoSet(0U);
    }
    if (HAL_TIM_Base_Start(&htim5) != HAL_OK ||
        HAL_TIM_PWM_Start(&htim2, TIM_CHANNEL_1) != HAL_OK) Error_Handler();
    if (SERVO_TEST_MODE) ServoTestInit();
    rfid_ready = TM_MFRC522_Init();
    if (!rfid_ready) Log("ERROR: RC522 khong phan hoi. Kiem tra 3.3V/SPI/RST, sau do reset kit.\r\n");
    uint32_t now = HAL_GetTick();
    last_trigger_ms = now - TRIGGER_INTERVAL_MS;
    last_rfid_ms = last_log_ms = now;
    Log("SMART PARKING 3T - NUCLEO-F401RE, %u slots. Lenh: add <10 HEX>\r\n", SENSOR_COUNT);
}

static void Parking_Process(void)
{
    if (SERVO_TEST_MODE) ServoButtonProcess(HAL_GetTick());
    SensorsProcess(HAL_GetTick());
    CommandProcess();
    if (!SERVO_TEST_MODE) DoorProcess(HAL_GetTick());
    RfidProcess(HAL_GetTick());
    uint32_t now = HAL_GetTick();
    if (door_state == DOOR_IDLE && (uint32_t)(now - last_log_ms) >= 1500U) {
        uint8_t occupied, free_slots, valid_mask;
        SlotCounts(&occupied, &free_slots, &valid_mask);
        last_log_ms = now;
        Log("S1:%ucm S2:%ucm S3:%ucm | Occupied:%u/%u Free:%u Valid:0x%X Cards:%u\r\n",
            sensors[0].distance_cm, sensors[1].distance_cm, sensors[2].distance_cm,
            occupied, SENSOR_COUNT, free_slots, valid_mask, card_count);
    }
}

/* APP_LOGIC_END */
/* USER CODE END 0 */

int main(void)
{
    HAL_Init();
    SystemClock_Config();
    MX_GPIO_Init();
    MX_SPI1_Init();
    MX_TIM2_Init();
    MX_TIM5_Init();
    /* USER CODE BEGIN 2 */
    Parking_Init();
    /* USER CODE END 2 */

    /* USER CODE BEGIN WHILE */
    while (1) {
        /* USER CODE END WHILE */
        /* USER CODE BEGIN 3 */
        Parking_Process();
        HAL_Delay(1U);
    }
    /* USER CODE END 3 */
}

void SystemClock_Config(void)
{
    RCC_OscInitTypeDef osc = {0};
    RCC_ClkInitTypeDef clk = {0};
    __HAL_RCC_PWR_CLK_ENABLE();
    __HAL_PWR_VOLTAGESCALING_CONFIG(PWR_REGULATOR_VOLTAGE_SCALE1);
    osc.OscillatorType = RCC_OSCILLATORTYPE_HSE;
    osc.HSEState = RCC_HSE_BYPASS;
    osc.PLL.PLLState = RCC_PLL_ON;
    osc.PLL.PLLSource = RCC_PLLSOURCE_HSE;
    osc.PLL.PLLM = 8;
    osc.PLL.PLLN = 336;
    osc.PLL.PLLP = RCC_PLLP_DIV4;
    osc.PLL.PLLQ = 4; /* PLLQ is unused: no USB OTG FS or SDIO. */
    if (HAL_RCC_OscConfig(&osc) != HAL_OK) Error_Handler();
    clk.ClockType = RCC_CLOCKTYPE_SYSCLK | RCC_CLOCKTYPE_HCLK |
                    RCC_CLOCKTYPE_PCLK1 | RCC_CLOCKTYPE_PCLK2;
    clk.SYSCLKSource = RCC_SYSCLKSOURCE_PLLCLK;
    clk.AHBCLKDivider = RCC_SYSCLK_DIV1;
    clk.APB1CLKDivider = RCC_HCLK_DIV2;
    clk.APB2CLKDivider = RCC_HCLK_DIV1;
    if (HAL_RCC_ClockConfig(&clk, FLASH_LATENCY_2) != HAL_OK) Error_Handler();
}

static void MX_SPI1_Init(void)
{
    hspi1.Instance = SPI1;
    hspi1.Init.Mode = SPI_MODE_MASTER;
    hspi1.Init.Direction = SPI_DIRECTION_2LINES;
    hspi1.Init.DataSize = SPI_DATASIZE_8BIT;
    hspi1.Init.CLKPolarity = SPI_POLARITY_LOW;
    hspi1.Init.CLKPhase = SPI_PHASE_1EDGE;
    hspi1.Init.NSS = SPI_NSS_SOFT;
    hspi1.Init.BaudRatePrescaler = SPI_BAUDRATEPRESCALER_32;
    hspi1.Init.FirstBit = SPI_FIRSTBIT_MSB;
    hspi1.Init.TIMode = SPI_TIMODE_DISABLE;
    hspi1.Init.CRCCalculation = SPI_CRCCALCULATION_DISABLE;
    hspi1.Init.CRCPolynomial = 10;
    if (HAL_SPI_Init(&hspi1) != HAL_OK) Error_Handler();
}

static void MX_TIM2_Init(void)
{
    TIM_ClockConfigTypeDef clock = {0};
    TIM_MasterConfigTypeDef master = {0};
    TIM_OC_InitTypeDef pwm = {0};
    htim2.Instance = TIM2;
    htim2.Init.Prescaler = 83;
    htim2.Init.CounterMode = TIM_COUNTERMODE_UP;
    htim2.Init.Period = 19999;
    htim2.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
    htim2.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
    if (HAL_TIM_Base_Init(&htim2) != HAL_OK) Error_Handler();
    clock.ClockSource = TIM_CLOCKSOURCE_INTERNAL;
    if (HAL_TIM_ConfigClockSource(&htim2, &clock) != HAL_OK) Error_Handler();
    if (HAL_TIM_PWM_Init(&htim2) != HAL_OK) Error_Handler();
    master.MasterOutputTrigger = TIM_TRGO_RESET;
    master.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;
    if (HAL_TIMEx_MasterConfigSynchronization(&htim2, &master) != HAL_OK) Error_Handler();
    pwm.OCMode = TIM_OCMODE_PWM1;
    pwm.Pulse = 1500; /* Neutral startup; Parking_Init selects the operating mode. */
    pwm.OCPolarity = TIM_OCPOLARITY_HIGH;
    pwm.OCFastMode = TIM_OCFAST_DISABLE;
    if (HAL_TIM_PWM_ConfigChannel(&htim2, &pwm, TIM_CHANNEL_1) != HAL_OK) Error_Handler();
    HAL_TIM_MspPostInit(&htim2);
}

static void MX_TIM5_Init(void)
{
    TIM_ClockConfigTypeDef clock = {0};
    TIM_MasterConfigTypeDef master = {0};
    htim5.Instance = TIM5;
    htim5.Init.Prescaler = 83;
    htim5.Init.CounterMode = TIM_COUNTERMODE_UP;
    htim5.Init.Period = 0xFFFFFFFFU;
    htim5.Init.ClockDivision = TIM_CLOCKDIVISION_DIV1;
    htim5.Init.AutoReloadPreload = TIM_AUTORELOAD_PRELOAD_DISABLE;
    if (HAL_TIM_Base_Init(&htim5) != HAL_OK) Error_Handler();
    clock.ClockSource = TIM_CLOCKSOURCE_INTERNAL;
    if (HAL_TIM_ConfigClockSource(&htim5, &clock) != HAL_OK) Error_Handler();
    master.MasterOutputTrigger = TIM_TRGO_RESET;
    master.MasterSlaveMode = TIM_MASTERSLAVEMODE_DISABLE;
    if (HAL_TIMEx_MasterConfigSynchronization(&htim5, &master) != HAL_OK) Error_Handler();
}

static void MX_GPIO_Init(void)
{
    GPIO_InitTypeDef gpio = {0};
    __HAL_RCC_GPIOH_CLK_ENABLE();
    __HAL_RCC_GPIOA_CLK_ENABLE();
    __HAL_RCC_GPIOB_CLK_ENABLE();
    __HAL_RCC_GPIOC_CLK_ENABLE();
    HAL_GPIO_WritePin(RFID_CS_GPIO_Port, RFID_CS_Pin, GPIO_PIN_SET);
    HAL_GPIO_WritePin(RFID_RST_GPIO_Port, RFID_RST_Pin, GPIO_PIN_SET);
    HAL_GPIO_WritePin(GPIOA, TRIG1_Pin, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(GPIOB, TRIG2_Pin | TRIG3_Pin, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(GPIOC, LED1_Pin | LED2_Pin | LED3_Pin, GPIO_PIN_RESET);
    gpio.Mode = GPIO_MODE_OUTPUT_PP;
    gpio.Pull = GPIO_NOPULL;
    gpio.Speed = GPIO_SPEED_FREQ_LOW;
    gpio.Pin = RFID_CS_Pin | TRIG1_Pin;
    HAL_GPIO_Init(GPIOA, &gpio);
    gpio.Pin = RFID_RST_Pin | TRIG2_Pin | TRIG3_Pin;
    HAL_GPIO_Init(GPIOB, &gpio);
    gpio.Pin = LED1_Pin | LED2_Pin | LED3_Pin;
    HAL_GPIO_Init(GPIOC, &gpio);
    /* Poll B1; it does not need the EXTI15_10 IRQ used by the Echo pins. */
    gpio.Pin = USER_BUTTON_Pin;
    gpio.Mode = GPIO_MODE_INPUT;
    gpio.Pull = GPIO_PULLUP;
    HAL_GPIO_Init(USER_BUTTON_GPIO_Port, &gpio);
    gpio.Pull = GPIO_NOPULL;
    gpio.Mode = GPIO_MODE_IT_RISING_FALLING;
    gpio.Pin = ECHO1_Pin;
    HAL_GPIO_Init(GPIOA, &gpio);
    gpio.Pin = ECHO2_Pin | ECHO3_Pin;
    HAL_GPIO_Init(GPIOB, &gpio);
    HAL_NVIC_SetPriority(EXTI1_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(EXTI1_IRQn);
    HAL_NVIC_SetPriority(EXTI15_10_IRQn, 0, 0);
    HAL_NVIC_EnableIRQ(EXTI15_10_IRQn);
}

void Error_Handler(void)
{
    __disable_irq();
    while (1) { }
}

#ifdef USE_FULL_ASSERT
void assert_failed(uint8_t *file, uint32_t line)
{
    (void)file;
    (void)line;
    Error_Handler();
}
#endif
