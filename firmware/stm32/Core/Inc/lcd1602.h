#ifndef SRC_LCD1602_H_
#define SRC_LCD1602_H_

#include "stm32f4xx_hal.h"
#include "main.h"

/* Chan LCD lay tu main.h (CubeMX) de luon khop voi .ioc */
#define LCD_RS_PORT    LCD_RS_GPIO_Port
#define LCD_RS_PIN     LCD_RS_Pin
#define LCD_E_PORT     LCD_EN_GPIO_Port
#define LCD_E_PIN      LCD_EN_Pin
#define LCD_D4_PORT    LCD_D4_GPIO_Port
#define LCD_D4_PIN     LCD_D4_Pin
#define LCD_D5_PORT    LCD_D5_GPIO_Port
#define LCD_D5_PIN     LCD_D5_Pin
#define LCD_D6_PORT    LCD_D6_GPIO_Port
#define LCD_D6_PIN     LCD_D6_Pin
#define LCD_D7_PORT    LCD_D7_GPIO_Port
#define LCD_D7_PIN     LCD_D7_Pin

void LCD_Init(void);
void LCD_Send_Command(uint8_t cmd);
void LCD_Send_Data(uint8_t data);
void LCD_Write_Char(char c);
void LCD_Write_String(const char *str);
void LCD_GotoXY(uint8_t row, uint8_t col);
void LCD_Clear(void);

/* Hien 2 dong (toi da 16 ky tu moi dong, tu dong chen khoang trang).
 * Chi ghi ra LCD khi noi dung THAY DOI nen khong gay chop hinh va khong ton CPU. */
void LCD_Show(const char *line1, const char *line2);

#endif /* SRC_LCD1602_H_ */
