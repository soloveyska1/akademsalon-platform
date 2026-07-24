"""Постоянные кнопки снизу (reply-клавиатура) — работают из любого состояния."""
from __future__ import annotations

from aiogram import F, Router
from aiogram.fsm.context import FSMContext
from aiogram.types import Message

from .. import db, keyboards as kb, texts
from .client import Ask

router = Router(name="menu_buttons")


@router.message(F.text == kb.BTN_NEW)
async def b_new(m: Message, state: FSMContext) -> None:
    await state.clear()
    await m.answer(texts.WIZ_TYPE, reply_markup=kb.wiz_types())


@router.message(F.text == kb.BTN_ORDERS)
async def b_orders(m: Message, state: FSMContext) -> None:
    await state.clear()
    orders = await db.orders_by_user(m.from_user.id, limit=10)
    if not orders:
        await m.answer("У вас пока нет заказов. Начнём с заявки? 🙂",
                       reply_markup=kb.main_menu(False))
        return
    await m.answer("📚 <b>Ваши заказы</b>", reply_markup=kb.orders_list(orders))


@router.message(F.text == kb.BTN_ASK)
async def b_ask(m: Message, state: FSMContext) -> None:
    await state.set_state(Ask.waiting)
    await m.answer(texts.ASK_QUESTION)


@router.message(F.text == kb.BTN_BONUS)
async def b_bonus(m: Message, state: FSMContext) -> None:
    from .client import show_bonus_menu
    await state.clear()
    await show_bonus_menu(m)


@router.message(F.text == kb.BTN_INFO)
async def b_info(m: Message, state: FSMContext) -> None:
    await state.clear()
    await m.answer(texts.HOW_WE_WORK, reply_markup=kb.back_menu())
