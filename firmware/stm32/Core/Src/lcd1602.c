#include "lcd1602.h"
#include "delay_us.h"
#include <string.h>

static char cache[2][17];

static void LCD_Write_4Bit(uint8_t nibble)
{
    HAL_GPIO_WritePin(LCD_D4_PORT, LCD_D4_PIN, (nibble & 0x01) ? GPIO_PIN_SET : GPIO_PIN_RESET);
    HAL_GPIO_WritePin(LCD_D5_PORT, LCD_D5_PIN, (nibble & 0x02) ? GPIO_PIN_SET : GPIO_PIN_RESET);
    HAL_GPIO_WritePin(LCD_D6_PORT, LCD_D6_PIN, (nibble & 0x04) ? GPIO_PIN_SET : GPIO_PIN_RESET);
    HAL_GPIO_WritePin(LCD_D7_PORT, LCD_D7_PIN, (nibble & 0x08) ? GPIO_PIN_SET : GPIO_PIN_RESET);

    /* Xung Enable: du dai (>= 450 ns) va thoi gian xu ly lenh ~40 us */
    HAL_GPIO_WritePin(LCD_E_PORT, LCD_E_PIN, GPIO_PIN_SET);
    delay_us(2);
    HAL_GPIO_WritePin(LCD_E_PORT, LCD_E_PIN, GPIO_PIN_RESET);
    delay_us(50);
}

void LCD_Send_Command(uint8_t cmd)
{
    HAL_GPIO_WritePin(LCD_RS_PORT, LCD_RS_PIN, GPIO_PIN_RESET);
    LCD_Write_4Bit(cmd >> 4);
    LCD_Write_4Bit(cmd & 0x0F);
}

void LCD_Send_Data(uint8_t data)
{
    HAL_GPIO_WritePin(LCD_RS_PORT, LCD_RS_PIN, GPIO_PIN_SET);
    LCD_Write_4Bit(data >> 4);
    LCD_Write_4Bit(data & 0x0F);
}

void LCD_Init(void)
{
    HAL_Delay(50);
    HAL_GPIO_WritePin(LCD_RS_PORT, LCD_RS_PIN, GPIO_PIN_RESET);
    HAL_GPIO_WritePin(LCD_E_PORT, LCD_E_PIN, GPIO_PIN_RESET);

    /* Chuoi khoi tao HD44780 che do 4-bit */
    LCD_Write_4Bit(0x03);
    HAL_Delay(5);
    LCD_Write_4Bit(0x03);
    HAL_Delay(1);
    LCD_Write_4Bit(0x03);
    HAL_Delay(1);
    LCD_Write_4Bit(0x02);
    HAL_Delay(1);

    LCD_Send_Command(0x28);   /* 4-bit, 2 dong, font 5x8 */
    LCD_Send_Command(0x0C);   /* bat hien thi, tat con tro */
    LCD_Send_Command(0x06);   /* tang con tro sang phai */
    LCD_Send_Command(0x01);   /* xoa man hinh */
    HAL_Delay(2);

    memset(cache, 0, sizeof(cache));
}

void LCD_Write_Char(char c)
{
    LCD_Send_Data((uint8_t)c);
}

void LCD_Write_String(const char *str)
{
    while (*str) {
        LCD_Write_Char(*str++);
    }
}

void LCD_GotoXY(uint8_t row, uint8_t col)
{
    uint8_t address = (row == 0) ? (0x80 + col) : (0xC0 + col);
    LCD_Send_Command(address);
}

void LCD_Clear(void)
{
    LCD_Send_Command(0x01);
    HAL_Delay(2);
    memset(cache, 0, sizeof(cache));
}

static void show_line(uint8_t row, const char *text)
{
    char buf[17];
    size_t n = strlen(text);
    if (n > 16) n = 16;
    memset(buf, ' ', 16);
    memcpy(buf, text, n);
    buf[16] = '\0';

    if (strcmp(buf, cache[row]) != 0) {
        LCD_GotoXY(row, 0);
        LCD_Write_String(buf);
        memcpy(cache[row], buf, 17);
    }
}

void LCD_Show(const char *line1, const char *line2)
{
    show_line(0, line1);
    show_line(1, line2);
}
