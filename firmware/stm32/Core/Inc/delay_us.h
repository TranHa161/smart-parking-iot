/**
 * delay_us.h - Delay do phan giai micro-giay bang bo dem chu ky DWT (Cortex-M4).
 * Khong dung timer nen khong anh huong TIM3 (servo) va SysTick (HAL).
 */
#ifndef DELAY_US_H
#define DELAY_US_H

#include "stm32f4xx.h"

static inline void DWT_Init(void)
{
    CoreDebug->DEMCR |= CoreDebug_DEMCR_TRCENA_Msk;
    DWT->CYCCNT = 0;
    DWT->CTRL  |= DWT_CTRL_CYCCNTENA_Msk;
}

static inline uint32_t DWT_Cycles(void)
{
    return DWT->CYCCNT;
}

/* Doi thanh so chu ky CPU. Phai goi sau SystemClock_Config(). */
static inline uint32_t US_TO_CYCLES(uint32_t us)
{
    return us * (SystemCoreClock / 1000000U);
}

static inline void delay_us(uint32_t us)
{
    uint32_t start = DWT->CYCCNT;
    uint32_t ticks = US_TO_CYCLES(us);
    while ((DWT->CYCCNT - start) < ticks) { }
}

#endif /* DELAY_US_H */
