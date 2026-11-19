#include "mfrc522.h"
#include <string.h>

extern SPI_HandleTypeDef hspi1;

/* ---- Chan dieu khien ---------------------------------------------------- */
#define CS_LOW()    HAL_GPIO_WritePin(RFID_SDA_GPIO_Port, RFID_SDA_Pin, GPIO_PIN_RESET)
#define CS_HIGH()   HAL_GPIO_WritePin(RFID_SDA_GPIO_Port, RFID_SDA_Pin, GPIO_PIN_SET)
#define RST_LOW()   HAL_GPIO_WritePin(RFID_RST_GPIO_Port, RFID_RST_Pin, GPIO_PIN_RESET)
#define RST_HIGH()  HAL_GPIO_WritePin(RFID_RST_GPIO_Port, RFID_RST_Pin, GPIO_PIN_SET)

/* ---- Thanh ghi ---------------------------------------------------------- */
#define REG_COMMAND       0x01
#define REG_COMM_IEN      0x02
#define REG_COMM_IRQ      0x04
#define REG_DIV_IRQ       0x05
#define REG_ERROR         0x06
#define REG_FIFO_DATA     0x09
#define REG_FIFO_LEVEL    0x0A
#define REG_CONTROL       0x0C
#define REG_BIT_FRAMING   0x0D
#define REG_MODE          0x11
#define REG_TX_CONTROL    0x14
#define REG_TX_ASK        0x15
#define REG_CRC_RESULT_M  0x21
#define REG_CRC_RESULT_L  0x22
#define REG_T_MODE        0x2A
#define REG_T_PRESCALER   0x2B
#define REG_T_RELOAD_H    0x2C
#define REG_T_RELOAD_L    0x2D
#define REG_VERSION       0x37

/* ---- Lenh --------------------------------------------------------------- */
#define PCD_IDLE          0x00
#define PCD_CALCCRC       0x03
#define PCD_TRANSCEIVE    0x0C
#define PCD_RESETPHASE    0x0F

#define PICC_REQIDL       0x26
#define PICC_ANTICOLL     0x93
#define PICC_HALT         0x50

#define MAX_LEN           16

/* ---- Truy cap thanh ghi ------------------------------------------------- */
static void wr(uint8_t reg, uint8_t val)
{
    uint8_t tx[2] = { (uint8_t)((reg << 1) & 0x7E), val };
    CS_LOW();
    HAL_SPI_Transmit(&hspi1, tx, 2, 10);
    CS_HIGH();
}

static uint8_t rd(uint8_t reg)
{
    uint8_t tx[2] = { (uint8_t)(((reg << 1) & 0x7E) | 0x80), 0x00 };
    uint8_t rx[2] = { 0, 0 };
    CS_LOW();
    HAL_SPI_TransmitReceive(&hspi1, tx, rx, 2, 10);
    CS_HIGH();
    return rx[1];
}

static void set_bits(uint8_t reg, uint8_t mask) { wr(reg, rd(reg) | mask); }
static void clr_bits(uint8_t reg, uint8_t mask) { wr(reg, rd(reg) & (uint8_t)~mask); }

static void antenna_on(void)
{
    if (!(rd(REG_TX_CONTROL) & 0x03)) {
        set_bits(REG_TX_CONTROL, 0x03);
    }
}

/* ---- Giao tiep voi the -------------------------------------------------- */
static MFRC522_Status_t to_card(uint8_t cmd, const uint8_t *send, uint8_t send_len,
                                uint8_t *back, uint16_t *back_bits)
{
    MFRC522_Status_t status = MFRC522_ERR;
    uint8_t irq_en = 0x00, wait_irq = 0x00, n = 0, last_bits;
    uint16_t i;

    if (cmd == PCD_TRANSCEIVE) {
        irq_en = 0x77;
        wait_irq = 0x30;
    }

    wr(REG_COMM_IEN, irq_en | 0x80);
    clr_bits(REG_COMM_IRQ, 0x80);
    set_bits(REG_FIFO_LEVEL, 0x80);        /* xoa FIFO */
    wr(REG_COMMAND, PCD_IDLE);

    for (i = 0; i < send_len; i++) {
        wr(REG_FIFO_DATA, send[i]);
    }

    wr(REG_COMMAND, cmd);
    if (cmd == PCD_TRANSCEIVE) {
        set_bits(REG_BIT_FRAMING, 0x80);   /* bat dau truyen */
    }

    i = 2000;
    do {
        n = rd(REG_COMM_IRQ);
        i--;
    } while (i != 0 && !(n & 0x01) && !(n & wait_irq));

    clr_bits(REG_BIT_FRAMING, 0x80);

    if (i != 0) {
        if (!(rd(REG_ERROR) & 0x1B)) {
            status = MFRC522_OK;
            if (n & irq_en & 0x01) {
                status = MFRC522_NOTAG;
            }
            if (cmd == PCD_TRANSCEIVE) {
                n = rd(REG_FIFO_LEVEL);
                last_bits = rd(REG_CONTROL) & 0x07;
                if (last_bits) {
                    *back_bits = (uint16_t)((n - 1) * 8 + last_bits);
                } else {
                    *back_bits = (uint16_t)(n * 8);
                }
                if (n == 0)       n = 1;
                if (n > MAX_LEN)  n = MAX_LEN;
                for (i = 0; i < n; i++) {
                    back[i] = rd(REG_FIFO_DATA);
                }
            }
        } else {
            status = MFRC522_ERR;
        }
    }
    return status;
}

static MFRC522_Status_t request(uint8_t *tag_type)
{
    uint16_t bits = 0;
    wr(REG_BIT_FRAMING, 0x07);
    tag_type[0] = PICC_REQIDL;
    MFRC522_Status_t st = to_card(PCD_TRANSCEIVE, tag_type, 1, tag_type, &bits);
    if (st != MFRC522_OK || bits != 0x10) {
        st = MFRC522_ERR;
    }
    return st;
}

static MFRC522_Status_t anticoll(uint8_t *ser)
{
    uint16_t bits = 0;
    wr(REG_BIT_FRAMING, 0x00);
    ser[0] = PICC_ANTICOLL;
    ser[1] = 0x20;
    MFRC522_Status_t st = to_card(PCD_TRANSCEIVE, ser, 2, ser, &bits);
    if (st == MFRC522_OK) {
        uint8_t check = 0;
        for (uint8_t i = 0; i < 4; i++) check ^= ser[i];
        if (check != ser[4]) st = MFRC522_ERR;   /* sai BCC */
    }
    return st;
}

static void calc_crc(const uint8_t *data, uint8_t len, uint8_t *out)
{
    clr_bits(REG_DIV_IRQ, 0x04);
    set_bits(REG_FIFO_LEVEL, 0x80);
    for (uint8_t i = 0; i < len; i++) wr(REG_FIFO_DATA, data[i]);
    wr(REG_COMMAND, PCD_CALCCRC);

    uint8_t i = 0xFF, n;
    do {
        n = rd(REG_DIV_IRQ);
        i--;
    } while (i && !(n & 0x04));

    out[0] = rd(REG_CRC_RESULT_L);
    out[1] = rd(REG_CRC_RESULT_M);
}

static void halt(void)
{
    uint8_t buf[MAX_LEN];
    uint16_t bits = 0;
    buf[0] = PICC_HALT;
    buf[1] = 0;
    calc_crc(buf, 2, &buf[2]);
    to_card(PCD_TRANSCEIVE, buf, 4, buf, &bits);
}

/* ---- API ---------------------------------------------------------------- */
uint8_t MFRC522_Init(void)
{
    CS_HIGH();
    RST_LOW();
    HAL_Delay(2);
    RST_HIGH();
    HAL_Delay(50);

    wr(REG_COMMAND, PCD_RESETPHASE);
    HAL_Delay(50);

    wr(REG_T_MODE, 0x8D);
    wr(REG_T_PRESCALER, 0x3E);
    wr(REG_T_RELOAD_L, 30);
    wr(REG_T_RELOAD_H, 0);
    wr(REG_TX_ASK, 0x40);
    wr(REG_MODE, 0x3D);

    antenna_on();
    return rd(REG_VERSION);
}

MFRC522_Status_t MFRC522_ReadUID(uint8_t uid[MFRC522_UID_LEN])
{
    uint8_t buf[MAX_LEN];
    MFRC522_Status_t st = request(buf);
    if (st != MFRC522_OK) {
        return MFRC522_NOTAG;
    }
    st = anticoll(buf);
    if (st != MFRC522_OK) {
        return MFRC522_ERR;
    }
    memcpy(uid, buf, MFRC522_UID_LEN);
    halt();
    return MFRC522_OK;
}
