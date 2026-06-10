export interface Event {
id:string
title:string
description?:string
repeatType:'daily'|'weekly'|'monthlyDate'|'monthlyWeekday'
repeatConfig:any
createdAt:string
}