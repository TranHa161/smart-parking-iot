/**
 * mfrc522.h - Driver RC522 (SPI1) cho STM32F4 HAL.
 * Viet lai gon, dua tren giao thuc MFRC522 chuan. Chi ho tro doc UID the Mifare 4 byte.
 *   SCK=PA5  MISO=PA6  MOSI=PA7  (SPI1)   CS(SDA)=PB6   RST=PC7
 */
#ifndef MFRC522_H
#define MFRC522_H

#include "main.h"
#include "stm32f4xx_hal.h"

typedef enum {
    MFRC522_OK = 0,
    MFRC522_NOTAG,
    MFRC522_ERR
} MFRC522_Status_t;

#define MFRC522_UID_LEN   4

/* Khoi tao. Tra ve gia tri thanh ghi VersionReg (0x91/0x92 la chip that,
 * 0x00 hoac 0xFF nghia la khong lien lac duoc: kiem tra day SPI/3.3V/CS/RST). */
uint8_t MFRC522_Init(void);

/* Doc UID the dang nam trong vung doc. Tra ve MFRC522_OK neu co the moi.
 * uid phai co it nhat 4 byte. The sau khi doc duoc se bi HALT:
 * muon doc lai phai dua the ra khoi vung doc roi dua vao lai. */
MFRC522_Status_t MFRC522_ReadUID(uint8_t uid[MFRC522_UID_LEN]);

#endif /* MFRC522_H */
