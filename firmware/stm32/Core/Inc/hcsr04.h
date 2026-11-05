#ifndef HCSR04_H
#define HCSR04_H

#include "stm32f4xx_hal.h"

/* Ma tra ve dac biet (deu >= FREE_CM nen logic bai do coi la "khong co xe"):
 *   997 = chan ECHO bi ket o muc CAO truoc khi trigger (ECHO cham 3V3/5V hoac cam bien loi)
 *   998 = KHONG co phan hoi: ECHO khong he len cao (mat nguon 5V/GND, sai TRIG, sai chan ECHO)
 *   999 = cam bien HOAT DONG nhung khong co vat can trong ~100 cm (binh thuong khi khong co gi truoc mat) */
#define HCSR04_ECHO_STUCK     997U
#define HCSR04_NO_RESPONSE    998U
#define HCSR04_OUT_OF_RANGE   999U

/**
 * Do khoang cach (cm). Tra ve HCSR04_OUT_OF_RANGE neu khong co vat can trong
 * ~100 cm hoac khong nhan duoc echo. Ham chan toi da khoang 7 ms.
 * ECHO cua HC-SR04 ra 5V: chi noi vao chan 5V-tolerant (PB10, PC4, PB15).
 */
uint16_t HCSR04_ReadCm(GPIO_TypeDef *trig_port, uint16_t trig_pin,
                       GPIO_TypeDef *echo_port, uint16_t echo_pin);

#endif /* HCSR04_H */
