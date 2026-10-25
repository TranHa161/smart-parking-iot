/* USER CODE BEGIN Header */
/**
  ******************************************************************************
  * @file           : main.h
  * @brief          : Header for main.c file.
  *                   This file contains the common defines of the application.
  ******************************************************************************
  * @attention
  *
  * Copyright (c) 2026 STMicroelectronics.
  * All rights reserved.
  *
  * This software is licensed under terms that can be found in the LICENSE file
  * in the root directory of this software component.
  * If no LICENSE file comes with this software, it is provided AS-IS.
  *
  ******************************************************************************
  */
/* USER CODE END Header */

/* Define to prevent recursive inclusion -------------------------------------*/
#ifndef __MAIN_H
#define __MAIN_H

#ifdef __cplusplus
extern "C" {
#endif

/* Includes ------------------------------------------------------------------*/
#include "stm32f4xx_hal.h"

/* Private includes ----------------------------------------------------------*/
/* USER CODE BEGIN Includes */

/* USER CODE END Includes */

/* Exported types ------------------------------------------------------------*/
/* USER CODE BEGIN ET */

/* USER CODE END ET */

/* Exported constants --------------------------------------------------------*/
/* USER CODE BEGIN EC */

/* USER CODE END EC */

/* Exported macro ------------------------------------------------------------*/
/* USER CODE BEGIN EM */

/* USER CODE END EM */

void HAL_TIM_MspPostInit(TIM_HandleTypeDef *htim);

/* Exported functions prototypes ---------------------------------------------*/
void Error_Handler(void);

/* USER CODE BEGIN EFP */
void Console_IRQHandler(void);
/* USER CODE END EFP */

/* Private defines -----------------------------------------------------------*/
#define USER_BUTTON_Pin GPIO_PIN_13
#define USER_BUTTON_GPIO_Port GPIOC
#define LED1_Pin GPIO_PIN_0
#define LED1_GPIO_Port GPIOC
#define LED2_Pin GPIO_PIN_1
#define LED2_GPIO_Port GPIOC
#define LED3_Pin GPIO_PIN_2
#define LED3_GPIO_Port GPIOC
#define ECHO1_Pin GPIO_PIN_1
#define ECHO1_GPIO_Port GPIOA
#define ECHO1_EXTI_IRQn EXTI1_IRQn
#define RFID_CS_Pin GPIO_PIN_4
#define RFID_CS_GPIO_Port GPIOA
#define RFID_RST_Pin GPIO_PIN_0
#define RFID_RST_GPIO_Port GPIOB
#define TRIG2_Pin GPIO_PIN_10
#define TRIG2_GPIO_Port GPIOB
#define ECHO2_Pin GPIO_PIN_12
#define ECHO2_GPIO_Port GPIOB
#define ECHO2_EXTI_IRQn EXTI15_10_IRQn
#define TRIG3_Pin GPIO_PIN_13
#define TRIG3_GPIO_Port GPIOB
#define ECHO3_Pin GPIO_PIN_14
#define ECHO3_GPIO_Port GPIOB
#define ECHO3_EXTI_IRQn EXTI15_10_IRQn
#define TRIG1_Pin GPIO_PIN_8
#define TRIG1_GPIO_Port GPIOA

/* USER CODE BEGIN Private defines */
/* 1: B1 controls SG90 for bench testing. 0: original RFID parking operation. */
#ifndef SERVO_TEST_MODE
#define SERVO_TEST_MODE 0U
#endif

/* USER CODE END Private defines */

#ifdef __cplusplus
}
#endif

#endif /* __MAIN_H */
