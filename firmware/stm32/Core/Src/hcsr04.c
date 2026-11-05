#include "hcsr04.h"
#include "delay_us.h"

/* Cho phep toi da 15ms de chan Echo bat len HIGH sau khi Trigger */
#define ECHO_RISE_TIMEOUT_US   15000U

/* Do toi da khoang 2.5m (~14500 us). Neu muon toi da 1m thi de 6000U */
#define ECHO_MAX_PULSE_US      15000U

uint16_t HCSR04_ReadCm(GPIO_TypeDef *trig_port, uint16_t trig_pin,
                       GPIO_TypeDef *echo_port, uint16_t echo_pin)
{
    /* 1. Kiem tra xem Echo co dang bi ket o muc CAO hay khong */
    if (HAL_GPIO_ReadPin(echo_port, echo_pin) == GPIO_PIN_SET) {
        return HCSR04_ECHO_STUCK;
    }

    /* 2. Dam bao chan Trig o muc THAP truoc khi kich xung */
    HAL_GPIO_WritePin(trig_port, trig_pin, GPIO_PIN_RESET);
    delay_us(5);

    /* 3. Phat xung Trigger 10 us */
    HAL_GPIO_WritePin(trig_port, trig_pin, GPIO_PIN_SET);
    delay_us(10);
    HAL_GPIO_WritePin(trig_port, trig_pin, GPIO_PIN_RESET);

    /* 4. Cho chan Echo bat len muc CAO (cho toi da 15 ms) */
    uint32_t t0 = DWT_Cycles();
    uint32_t rise_limit = US_TO_CYCLES(ECHO_RISE_TIMEOUT_US);
    while (HAL_GPIO_ReadPin(echo_port, echo_pin) == GPIO_PIN_RESET) {
        if ((DWT_Cycles() - t0) > rise_limit) {
            return HCSR04_NO_RESPONSE;         /* Timeout: Khong thay Echo len */
        }
    }

    /* 5. Do thoi gian chan Echo giu o muc CAO */
    uint32_t t1 = DWT_Cycles();
    uint32_t pulse_limit = US_TO_CYCLES(ECHO_MAX_PULSE_US);
    while (HAL_GPIO_ReadPin(echo_port, echo_pin) == GPIO_PIN_SET) {
        if ((DWT_Cycles() - t1) > pulse_limit) {
            return HCSR04_OUT_OF_RANGE;        /* Khong co vat can trong tam do */
        }
    }

    /* 6. Tinh toan khoang cach (cm = us / 58) */
    uint32_t cycles = DWT_Cycles() - t1;
    uint32_t pulse_us = cycles / (SystemCoreClock / 1000000U);

    return (uint16_t)(pulse_us / 58U);
}
