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

/* USER CODE END EFP */

/* Private defines -----------------------------------------------------------*/
#define LCD_D5_Pin GPIO_PIN_4
#define LCD_D5_GPIO_Port GPIOA
#define ECHO_2_Pin GPIO_PIN_4
#define ECHO_2_GPIO_Port GPIOC
#define LED1_YELLOW_Pin GPIO_PIN_5
#define LED1_YELLOW_GPIO_Port GPIOC
#define LCD_D6_Pin GPIO_PIN_0
#define LCD_D6_GPIO_Port GPIOB
#define LED3_GREEN_Pin GPIO_PIN_1
#define LED3_GREEN_GPIO_Port GPIOB
#define LED2_GREEN_Pin GPIO_PIN_2
#define LED2_GREEN_GPIO_Port GPIOB
#define ECHO_1_Pin GPIO_PIN_10
#define ECHO_1_GPIO_Port GPIOB
#define LED2_YELLOW_Pin GPIO_PIN_12
#define LED2_YELLOW_GPIO_Port GPIOB
#define TRIG_2_Pin GPIO_PIN_13
#define TRIG_2_GPIO_Port GPIOB
#define TRIG_3_Pin GPIO_PIN_14
#define TRIG_3_GPIO_Port GPIOB
#define ECHO_3_Pin GPIO_PIN_15
#define ECHO_3_GPIO_Port GPIOB
#define LED1_GREEN_Pin GPIO_PIN_6
#define LED1_GREEN_GPIO_Port GPIOC
#define RFID_RST_Pin GPIO_PIN_7
#define RFID_RST_GPIO_Port GPIOC
#define LED1_RED_Pin GPIO_PIN_8
#define LED1_RED_GPIO_Port GPIOC
#define LED2_RED_Pin GPIO_PIN_9
#define LED2_RED_GPIO_Port GPIOC
#define BUZZER_Pin GPIO_PIN_8
#define BUZZER_GPIO_Port GPIOA
#define LCD_D7_Pin GPIO_PIN_11
#define LCD_D7_GPIO_Port GPIOA
#define LED3_RED_Pin GPIO_PIN_12
#define LED3_RED_GPIO_Port GPIOA
#define LED3_YELLOW_Pin GPIO_PIN_10
#define LED3_YELLOW_GPIO_Port GPIOC
#define TRIG_1_Pin GPIO_PIN_3
#define TRIG_1_GPIO_Port GPIOB
#define LCD_D4_Pin GPIO_PIN_5
#define LCD_D4_GPIO_Port GPIOB
#define RFID_SDA_Pin GPIO_PIN_6
#define RFID_SDA_GPIO_Port GPIOB
#define LCD_RS_Pin GPIO_PIN_8
#define LCD_RS_GPIO_Port GPIOB
#define LCD_EN_Pin GPIO_PIN_9
#define LCD_EN_GPIO_Port GPIOB

/* USER CODE BEGIN Private defines */

/* USER CODE END Private defines */

#ifdef __cplusplus
}
#endif

#endif /* __MAIN_H */
