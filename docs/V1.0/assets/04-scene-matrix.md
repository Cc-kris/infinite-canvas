# 资产 04｜场景编排矩阵实例

> **资产来源**：[`make_cases.json.gz`](../../analysis/assets/linkfox/make_cases.json.gz)
> **应用位置**：套图/穿搭批量编排器：场景勾选、每场景数量、主图与 A+ 配置
> **数据范围**：93 条真实 configData 实例
> **使用边界**：仅用于复刻开发与内部 A/B 基准；原站图片、模板及文案不直接进入商用资产库。

---

## 怎么用

- 用于 `PRODUCT_IMAGE_SUITE(type=71)`、`DRESS_WEAR_SET(type=69)` 的批量任务展开。
- 将每个 `sceneType` 中 `checked=true` 的项展开为子任务，数量为 `num`；共享输入图与品牌参数。
- 这里是官方案例记录的真实配置，不是凭空设计的参数格式。

共提取 93 条含 `configData` 的案例。

## 1. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2026966441820966912

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 6
      },
      "A+Phone": {
        "checked": false,
        "num": 6
      },
      "A+Pro": {
        "checked": false,
        "num": 6
      },
      "custom": {
        "checked": false,
        "num": 6
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 3
      }
    }
  }
}
~~~

## 2. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010584971116363776

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "A+Phone": {
        "checked": false,
        "num": 4
      },
      "A+Pro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:2",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 3. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010559668042153984

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "A+Pro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:2",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 4. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2052630503189741568

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "A+Phone": {
        "checked": false,
        "num": 4
      },
      "A+Pro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 5. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2042559549172404224

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 2
      },
      "A+Phone": {
        "checked": false,
        "num": 2
      },
      "A+Pro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 2
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "ins": {
        "checked": false,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 6. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2042550493179334656

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 2
      },
      "A+Phone": {
        "checked": false,
        "num": 2
      },
      "A+Pro": {
        "checked": true,
        "num": 2
      },
      "custom": {
        "checked": false,
        "num": 2
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "ins": {
        "checked": false,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 7. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2042550605402132480

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 2
      },
      "A+Phone": {
        "checked": false,
        "num": 2
      },
      "A+Pro": {
        "checked": true,
        "num": 2
      },
      "custom": {
        "checked": false,
        "num": 2
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "ins": {
        "checked": false,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 2
      },
      "scene": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 8. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2037102697139732480

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "A+Phone": {
        "checked": false,
        "num": 4
      },
      "A+Pro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 9. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2037106539239636992

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 2
      },
      "A+Phone": {
        "checked": false,
        "num": 2
      },
      "A+Pro": {
        "checked": true,
        "num": 2
      },
      "custom": {
        "checked": false,
        "num": 2
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 10. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2037106761474834432

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 2
      },
      "A+Phone": {
        "checked": false,
        "num": 2
      },
      "A+Pro": {
        "checked": true,
        "num": 2
      },
      "custom": {
        "checked": false,
        "num": 2
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 11. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2037108682935828480

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 2
      },
      "A+Phone": {
        "checked": false,
        "num": 2
      },
      "A+Pro": {
        "checked": true,
        "num": 2
      },
      "custom": {
        "checked": false,
        "num": 2
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 12. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2034938374070009856

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 2
      },
      "A+Phone": {
        "checked": false,
        "num": 2
      },
      "A+Pro": {
        "checked": true,
        "num": 2
      },
      "custom": {
        "checked": false,
        "num": 2
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "ins": {
        "checked": false,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 2
      }
    }
  }
}
~~~

## 13. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2034939802050166784

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "A+Phone": {
        "checked": false,
        "num": 4
      },
      "A+Pro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 14. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2019725199905161216

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "A+Phone": {
        "checked": false,
        "num": 4
      },
      "A+Pro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 15. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2013185524178739200

~~~text
{
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 16. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2032294037771280384

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "A+Phone": {
        "checked": false,
        "num": 4
      },
      "A+Pro": {
        "checked": true,
        "num": 8
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 8
      },
      "point": {
        "checked": true,
        "num": 8
      },
      "scene": {
        "checked": true,
        "num": 8
      }
    }
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 17. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2032300382369112064

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 6
      },
      "A+Phone": {
        "checked": false,
        "num": 6
      },
      "A+Pro": {
        "checked": true,
        "num": 6
      },
      "custom": {
        "checked": false,
        "num": 6
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 6
      }
    }
  }
}
~~~

## 18. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2032302502182936576

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "A+Phone": {
        "checked": false,
        "num": 4
      },
      "A+Pro": {
        "checked": false,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 8
      }
    }
  }
}
~~~

## 19. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2028402457421303808

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "A+Phone": {
        "checked": false,
        "num": 4
      },
      "A+Pro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 20. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2028406529385844736

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 5
      },
      "A+Phone": {
        "checked": false,
        "num": 5
      },
      "A+Pro": {
        "checked": true,
        "num": 5
      },
      "custom": {
        "checked": false,
        "num": 5
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 21. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010585128381792256

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "A+Phone": {
        "checked": false,
        "num": 4
      },
      "A+Pro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:2",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 22. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2011701173366583296

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 8
      },
      "A+Pro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "英语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 8
      }
    }
  }
}
~~~

## 23. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010585318861914112

~~~text
{
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "size": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 24. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010685323371159552

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 25. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010963040503492608

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "日语",
    "platform": "亚马逊",
    "salesRegion": "日本"
  },
  "mainConfig": {
    "aspectRatio": "3:2",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 26. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010962897360285696

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "英语",
    "platform": "亚马逊",
    "salesRegion": "美国"
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": false,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      }
    }
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 27. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010962533525385216

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "英语",
    "platform": "亚马逊",
    "salesRegion": "美国"
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      }
    }
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 28. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010960025985904640

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "英语",
    "platform": "亚马逊",
    "salesRegion": "美国"
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      }
    }
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 29. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010959720435052544

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "英语",
    "platform": "亚马逊",
    "salesRegion": "美国"
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      }
    }
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 30. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010959585374269440

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "英语",
    "platform": "亚马逊",
    "salesRegion": "美国"
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      }
    }
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 31. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010959234147446784

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:2",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": false,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 8
      }
    }
  }
}
~~~

## 32. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010959126689378304

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      }
    }
  },
  "model": {
    "modelId": "1914918985472114688",
    "modelImageUrl": "https://test-file-ai.linkfox.com/UPLOAD/MANAGE/08d3f0617de34f85ae47beb9c65f4610.png",
    "modelName": "晴晴",
    "modelTabType": "1",
    "modelType": "1"
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 33. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010959071039352832

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": false,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 34. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010958894127804416

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": false,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 35. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010958835940225024

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": false,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      }
    }
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 36. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010958432540454912

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "俄语",
    "platform": "亚马逊",
    "salesRegion": "俄罗斯"
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "21:9",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": false,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      }
    }
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 37. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010958265976254464

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "日语",
    "platform": "亚马逊",
    "salesRegion": "日本"
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "3:2",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      }
    }
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 38. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010957828158025728

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "马来语",
    "platform": "亚马逊",
    "salesRegion": "东南亚"
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      }
    }
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 39. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010957567209402368

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "英语",
    "platform": "亚马逊",
    "salesRegion": "美国"
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      }
    }
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 40. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010685390236753920

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 41. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010685206895337472

~~~text
{
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "日语",
    "platform": "亚马逊",
    "salesRegion": "日本"
  },
  "mainConfig": {
    "aspectRatio": "9:16",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": false,
        "num": 4
      },
      "scene": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 42. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010685066205798400

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "A+Phone": {
        "checked": false,
        "num": 4
      },
      "A+Pro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:2",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 43. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010684062882144256

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "A+Pro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 8
      },
      "point": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 44. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010683853808672768

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "A+Pro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "size": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 45. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010683783411474432

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "A+Pro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "size": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 46. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010683353734389760

~~~text
{
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": false,
        "num": 4
      },
      "size": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 47. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010683204337475584

~~~text
{
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": false,
        "num": 4
      },
      "point": {
        "checked": false,
        "num": 4
      },
      "scene": {
        "checked": false,
        "num": 4
      },
      "size": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 48. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010586696086798336

~~~text
{
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "size": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 49. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010585844961853440

~~~text
{
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "size": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 50. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010584628039073792

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "A+Phone": {
        "checked": false,
        "num": 4
      },
      "A+Pro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 4
      },
      "point": {
        "checked": true,
        "num": 4
      },
      "size": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 51. type=69 DRESS_WEAR_SET / 穿搭套装 · case 2010538281869066240

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+Phone": {
        "checked": true,
        "num": 4
      },
      "A+Pro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "isExactScene": false,
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "ins": {
        "checked": true,
        "num": 2
      },
      "point": {
        "checked": true,
        "num": 2
      },
      "scene": {
        "checked": true,
        "num": 2
      },
      "size": {
        "checked": true,
        "num": 2
      },
      "white": {
        "checked": true,
        "num": 2
      }
    }
  },
  "prompt": "",
  "sceneMaterial": []
}
~~~

## 52. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2026855585971982336

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "意大利语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 53. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2026854347385622528

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 5
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 5
      },
      "APlusPro": {
        "checked": false,
        "num": 5
      },
      "custom": {
        "checked": false,
        "num": 5
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "意大利语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 54. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2008849264547028909

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "西班牙语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "default",
    "modelType": "pro",
    "sceneType": {
      "closeUp": {
        "checked": false,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 55. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2052656145868357632

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 56. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2049791360688578560

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 57. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2048645339790995456

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 8
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "sceneType": {
      "closeUp": {
        "checked": true,
        "num": 8
      },
      "scene": {
        "checked": true,
        "num": 8
      },
      "sellPoint": {
        "checked": true,
        "num": 8
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 58. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2048646069000105984

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 8
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "closeUp": {
        "checked": true,
        "num": 8
      },
      "scene": {
        "checked": true,
        "num": 8
      },
      "sellPoint": {
        "checked": true,
        "num": 8
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 59. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2037116582322327552

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 60. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2037115898130681856

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 61. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2035901013554167808

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 62. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2035911132090269696

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 63. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2032412870417752064

~~~text
{
  "mainConfig": {
    "aspectRatio": "1:1",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 8
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 64. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2032294709400985600

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 8
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "modelType": "pro",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 8
      },
      "sellPoint": {
        "checked": true,
        "num": 8
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 65. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2028424512657182720

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 66. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2028384697144332288

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 67. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2028387370723725312

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 5
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 68. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2028387188518965248

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 69. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2028400296826261504

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 70. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2019675097706561536

~~~text
{
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "closeUp": {
        "checked": false,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 3
      }
    }
  },
  "pointStyles": [
    {
      "id": "2015994183665352704",
      "imageUrl": "https://file-ai.linkfox.com/UPLOAD/MANAGE/e49b478e96624099aa172d127d7b902c.png",
      "imageUrlThumb": "https://file-ai.linkfox.com/UPLOAD/MANAGE/e49b478e96624099aa172d127d7b902c.png?Expires=1793115499&OSSAccessKeyId=LTAI5tQMD3UtDGPmMJRik6JA&Signature=kTy6ExCOpDBzmXV6YTlRRVr%2FZEw%3D&x-oss-process=image%2Fresize%2Cm_mfit%2Cw_512%2Ch_512",
      "materialSource": 2,
      "prompt": "[图片]\n【A+ 模块10: Material & Craftsmanship / 材质与工艺细节】 󰀠对标卖点: [引用关于面料、工艺、设计细节的卖点] 󰀠视觉构图描述: 【“解构”式展示】: 【将商品平铺在有质感的商业大片场景下拍摄，旁边放置面料样张、拉链、纽扣等组成部件，并用文字分别说明其材质或工艺优势。】  󰀠Text on Image ****(Must be in Target Language): 󰀡Detail 1 Title: \"[翻译为目标语言: 细节名称]\" 󰀡Detail 1 Text:\"[翻译为目标语言: 细节优势描述]\" 󰀡... (根据所选版式调整) 󰀠背景与颜色建议: [优先采用用户定义的字体和主色调。若无，则根据服装风格建议字体和主色调。背景建议: 商业摄影聚焦在商品上]",
      "style": "C10",
      "tabType": "1"
    },
    {
      "id": "2015994102077751296",
      "imageUrl": "https://file-ai.linkfox.com/UPLOAD/MANAGE/3e0fe80173584f5ab5398fd47ed68ba0.png",
      "imageUrlThumb": "https://file-ai.linkfox.com/UPLOAD/MANAGE/3e0fe80173584f5ab5398fd47ed68ba0.png?Expires=1793115499&OSSAccessKeyId=LTAI5tQMD3UtDGPmMJRik6JA&Signature=szhsUXnW43ubgSzCTb%2BbBpO2d5s%3D&x-oss-process=image%2Fresize%2Cm_mfit%2Cw_512%2Ch_512",
      "materialSource": 2,
      "prompt": "【A+ 模块9: Material & Craftsmanship / 材质与工艺细节】 󰀠对标卖点: [引用关于面料、工艺、设计细节的卖点] 󰀠视觉构图描述: 【热点标注式布局】: 【从服装的关键部位（如口袋、腰线）引出线条，分别对应放大后的细节圆形图】  󰀠Text on Image ****(Must be in Target Language): 󰀡Detail 1 Title: \"[翻译为目标语言: 细节名称]\" 󰀡Detail 1 Text:\"[翻译为目标语言: 细节优势描述]\" 󰀡... (根据所选版式调整) 󰀠背景与颜色建议: [优先采用用户定义的字体和主色调。若无，则根据服装风格建议字体和主色调。背景建议: 商业摄影聚焦在商品上]",
      "style": "C9",
      "tabType": "1"
    },
    {
      "id": "2015994698176430080",
      "imageUrl": "https://file-ai.linkfox.com/UPLOAD/MANAGE/9c72a8ac9ed94cd7959a5526b48dbae8.png",
      "imageUrlThumb": "https://file-ai.linkfox.com/UPLOAD/MANAGE/9c72a8ac9ed94cd7959a5526b48dbae8.png?Expires=1793111033&OSSAccessKeyId=LTAI5tQMD3UtDGPmMJRik6JA&Signature=y7nBD6UmQ%2FUFIt8R3Tg9Z1wza2w%3D&x-oss-process=image%2Fresize%2Cm_mfit%2Cw_512%2Ch_512",
      "materialSource": 2,
      "prompt": "【A+ 模块15: Lifestyle Application / 生活化场景展示】 󰀠对标卖点: [引用最能体现服装风格或整体穿着体验的卖点] 󰀠视觉构图描述:  全宽高清横幅图: 一张充满故事感的单场景大图，模特自然融入其中。 图中必须为[明确指出性别，如“欧美男模特”或“欧美女模特”】 󰀠Text on Image ****(Must be in Target Language): 󰀡Headline: \"[根据目标语言撰写吸引人的标题]\" 󰀡Body: \"[根据目标语言撰写利益点文案]\" 󰀡... (根据所选版式调整) 󰀠背景与颜色建议: [优先采用用户定义的字体和主色调。若无，则根据服装风格建议字体和主色调。背景建议: 展示穿搭的生活方式图]",
      "style": "C15",
      "tabType": "1"
    }
  ]
}
~~~

## 71. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2019697152908886016

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 72. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2011681772462436352

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "意大利语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 73. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2011337089922191360

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 8
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "意大利语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 8
      }
    }
  }
}
~~~

## 74. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2026974468833824768

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 6
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 6
      },
      "APlusPro": {
        "checked": false,
        "num": 6
      },
      "custom": {
        "checked": false,
        "num": 6
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 6
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 75. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2009186705338691508

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "#7B7A65",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "英语",
    "platform": "亚马逊",
    "salesRegion": "美国"
  },
  "mainConfig": {
    "aspectRatio": "default",
    "modelType": "pro",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 76. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2011325081730502656

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 8
      },
      "APlusPro": {
        "checked": false,
        "num": 8
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "closeUp": {
        "checked": false,
        "num": 4
      },
      "scene": {
        "checked": false,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 8
      }
    }
  }
}
~~~

## 77. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2021469198126972928

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 78. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2021514778018611200

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "意大利语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 79. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2019726436646027264

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "aPlusStyles": [
    {
      "id": "2015995351292477440",
      "imageUrl": "https://file-ai.linkfox.com/UPLOAD/MANAGE/1df94fc1ddbf42468f378e1779150945.png",
      "imageUrlThumb": "https://file-ai.linkfox.com/UPLOAD/MANAGE/1df94fc1ddbf42468f378e1779150945.png?Expires=1793115862&OSSAccessKeyId=LTAI5tQMD3UtDGPmMJRik6JA&Signature=VbBX2KIi1O4q%2F06hzHf4IHWASM8%3D&x-oss-process=image%2Fresize%2Cm_mfit%2Cw_512%2Ch_512",
      "materialSource": 2,
      "prompt": "[M1-PosterTitle] 电影感杂志封面\n[核心构图]： 智能采用非对称的60-40分割布局 / 中心对称的构图。\n主题：沉浸式的主题铺满画布，放置高清的人物主体，背景进行模拟相机焦距虚化（Bokeh）处理，突出人物轮廓。\n字体留白：如选择60-40分割，利用背景的留白（如天空、虚化的草地/墙面）作为文字排版区，如选择中心对称的构图，字体叠加在画面中央\n[排版策略 - 字体混搭]： 必须使用**“信息层级混排”**逻辑来营造高级感：\n信息层（衬线/黑体）：使用庄重的粗衬线体 (Serif) 或 超粗无衬线体 书写产品核心词（如 COAT, BOOTS）。\n氛围层（手写体）：智能使用，飘逸的英文手写体 (Script) / 极细的衬线体 作为装饰，书写形容词或品牌名（如 Vintage, Luxury, Summer）。\n[光影与层次]：\n强调自然光/夕阳光感，避免生硬的抠图感。\n限制：\n1. 必须展示模特上身效果，禁止裁切头部",
      "style": "M1",
      "tabType": "1"
    },
    {
      "id": "2015995864071307264",
      "imageUrl": "https://file-ai.linkfox.com/UPLOAD/MANAGE/ac4820aeb5ba43e094c908aabce79040.jpg",
      "imageUrlThumb": "https://file-ai.linkfox.com/UPLOAD/MANAGE/ac4820aeb5ba43e094c908aabce79040.jpg?Expires=1793115746&OSSAccessKeyId=LTAI5tQMD3UtDGPmMJRik6JA&Signature=aZncASIy2v19%2Fi8lE1udvR0PFZ4%3D&x-oss-process=image%2Fresize%2Cm_mfit%2Cw_512%2Ch_512",
      "materialSource": 2,
      "prompt": "[M3-FlatLay]: 平面搭配\n垂直俯拍，搭配互补单品， 使用有质感的背景底纹",
      "style": "M3",
      "tabType": "1"
    },
    {
      "id": "2015997231842230272",
      "imageUrl": "https://file-ai.linkfox.com/UPLOAD/MANAGE/35a12adae81045a1a0784fa6e9a32d1a.jpg",
      "imageUrlThumb": "https://file-ai.linkfox.com/UPLOAD/MANAGE/35a12adae81045a1a0784fa6e9a32d1a.jpg?Expires=1793111033&OSSAccessKeyId=LTAI5tQMD3UtDGPmMJRik6JA&Signature=tpEBQAy2aZ8roC%2FDMQ11iCYPPX8%3D&x-oss-process=image%2Fresize%2Cm_mfit%2Cw_512%2Ch_512",
      "materialSource": 2,
      "prompt": "[M10-EditorialGrid]: 合辑网格\n采用非对称网格布局，将“多角度棚拍”（侧面/背面展示版型）与“街拍生活图”混排，配合大面积留白和衬线字体，模拟Lookbook杂志内页，强调高级感。",
      "style": "M10",
      "tabType": "1"
    },
    {
      "id": "2015995953107992576",
      "imageUrl": "https://file-ai.linkfox.com/UPLOAD/MANAGE/553a745a36f04f4f9558e87ef9cf009a.png",
      "imageUrlThumb": "https://file-ai.linkfox.com/UPLOAD/MANAGE/553a745a36f04f4f9558e87ef9cf009a.png?Expires=1793115473&OSSAccessKeyId=LTAI5tQMD3UtDGPmMJRik6JA&Signature=6%2FCT0zSK3UbKkLBRFetVlkV8Dsw%3D&x-oss-process=image%2Fresize%2Cm_mfit%2Cw_512%2Ch_512",
      "materialSource": 2,
      "prompt": "[M4-Magazine]: 杂志拼贴杂志剪贴簿风格，纸张叠加、回形针装饰，Ghost Mannequin排版，充满画面。",
      "style": "M4",
      "tabType": "1"
    }
  ],
  "mainConfig": {
    "aspectRatio": "1:1",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 80. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2019674765005979648

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": false,
        "num": 4
      },
      "APlusHasPhone": {
        "checked": false,
        "num": 4
      },
      "APlusPro": {
        "checked": true,
        "num": 4
      },
      "custom": {
        "checked": false,
        "num": 4
      }
    }
  },
  "aPlusStyles": [
    {
      "id": "2015995351292477440",
      "imageUrl": "https://file-ai.linkfox.com/UPLOAD/MANAGE/1df94fc1ddbf42468f378e1779150945.png",
      "imageUrlThumb": "https://file-ai.linkfox.com/UPLOAD/MANAGE/1df94fc1ddbf42468f378e1779150945.png?Expires=1793115862&OSSAccessKeyId=LTAI5tQMD3UtDGPmMJRik6JA&Signature=VbBX2KIi1O4q%2F06hzHf4IHWASM8%3D&x-oss-process=image%2Fresize%2Cm_mfit%2Cw_512%2Ch_512",
      "materialSource": 2,
      "prompt": "[M1-PosterTitle] 电影感杂志封面\n[核心构图]： 智能采用非对称的60-40分割布局 / 中心对称的构图。\n主题：沉浸式的主题铺满画布，放置高清的人物主体，背景进行模拟相机焦距虚化（Bokeh）处理，突出人物轮廓。\n字体留白：如选择60-40分割，利用背景的留白（如天空、虚化的草地/墙面）作为文字排版区，如选择中心对称的构图，字体叠加在画面中央\n[排版策略 - 字体混搭]： 必须使用**“信息层级混排”**逻辑来营造高级感：\n信息层（衬线/黑体）：使用庄重的粗衬线体 (Serif) 或 超粗无衬线体 书写产品核心词（如 COAT, BOOTS）。\n氛围层（手写体）：智能使用，飘逸的英文手写体 (Script) / 极细的衬线体 作为装饰，书写形容词或品牌名（如 Vintage, Luxury, Summer）。\n[光影与层次]：\n强调自然光/夕阳光感，避免生硬的抠图感。\n限制：\n1. 必须展示模特上身效果，禁止裁切头部",
      "style": "M1",
      "tabType": "1"
    },
    {
      "id": "2015995864071307264",
      "imageUrl": "https://file-ai.linkfox.com/UPLOAD/MANAGE/ac4820aeb5ba43e094c908aabce79040.jpg",
      "imageUrlThumb": "https://file-ai.linkfox.com/UPLOAD/MANAGE/ac4820aeb5ba43e094c908aabce79040.jpg?Expires=1793115746&OSSAccessKeyId=LTAI5tQMD3UtDGPmMJRik6JA&Signature=aZncASIy2v19%2Fi8lE1udvR0PFZ4%3D&x-oss-process=image%2Fresize%2Cm_mfit%2Cw_512%2Ch_512",
      "materialSource": 2,
      "prompt": "[M3-FlatLay]: 平面搭配\n垂直俯拍，搭配互补单品， 使用有质感的背景底纹",
      "style": "M3",
      "tabType": "1"
    },
    {
      "id": "2015997231842230272",
      "imageUrl": "https://file-ai.linkfox.com/UPLOAD/MANAGE/35a12adae81045a1a0784fa6e9a32d1a.jpg",
      "imageUrlThumb": "https://file-ai.linkfox.com/UPLOAD/MANAGE/35a12adae81045a1a0784fa6e9a32d1a.jpg?Expires=1793111033&OSSAccessKeyId=LTAI5tQMD3UtDGPmMJRik6JA&Signature=tpEBQAy2aZ8roC%2FDMQ11iCYPPX8%3D&x-oss-process=image%2Fresize%2Cm_mfit%2Cw_512%2Ch_512",
      "materialSource": 2,
      "prompt": "[M10-EditorialGrid]: 合辑网格\n采用非对称网格布局，将“多角度棚拍”（侧面/背面展示版型）与“街拍生活图”混排，配合大面积留白和衬线字体，模拟Lookbook杂志内页，强调高级感。",
      "style": "M10",
      "tabType": "1"
    },
    {
      "id": "2015995953107992576",
      "imageUrl": "https://file-ai.linkfox.com/UPLOAD/MANAGE/553a745a36f04f4f9558e87ef9cf009a.png",
      "imageUrlThumb": "https://file-ai.linkfox.com/UPLOAD/MANAGE/553a745a36f04f4f9558e87ef9cf009a.png?Expires=1793115473&OSSAccessKeyId=LTAI5tQMD3UtDGPmMJRik6JA&Signature=6%2FCT0zSK3UbKkLBRFetVlkV8Dsw%3D&x-oss-process=image%2Fresize%2Cm_mfit%2Cw_512%2Ch_512",
      "materialSource": 2,
      "prompt": "[M4-Magazine]: 杂志拼贴杂志剪贴簿风格，纸张叠加、回形针装饰，Ghost Mannequin排版，充满画面。",
      "style": "M4",
      "tabType": "1"
    }
  ],
  "mainConfig": {
    "aspectRatio": "1:1",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      },
      "whiteBg": {
        "checked": false,
        "num": 4
      }
    }
  }
}
~~~

## 81. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2011727853267218432

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "sellPoint": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 82. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2011325984118231040

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 8
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "closeUp": {
        "checked": false,
        "num": 4
      },
      "scene": {
        "checked": false,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 83. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2011707383910264832

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 8
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "closeUp": {
        "checked": false,
        "num": 4
      },
      "scene": {
        "checked": false,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 8
      }
    }
  }
}
~~~

## 84. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2011702589795627008

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "意大利语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 8
      }
    }
  }
}
~~~

## 85. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2011686671753441280

~~~text
{
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "英语",
    "platform": "亚马逊",
    "salesRegion": "英国"
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "closeUp": {
        "checked": false,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 8
      }
    }
  }
}
~~~

## 86. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2011694425352204288

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "意大利语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 8
      }
    }
  }
}
~~~

## 87. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2011341529567809536

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 8
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "意大利语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "3:4",
    "modelType": "pro",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 8
      }
    }
  }
}
~~~

## 88. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2009186156518207401

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "#2F312D",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "优雅衬线体",
    "language": "德语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "default",
    "modelType": "pro",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 89. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2009197856378220503

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "APlusPro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "modelType": "pro",
    "sceneType": {
      "closeUp": {
        "checked": true,
        "num": 4
      },
      "closeUpWhite": {
        "checked": true,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 90. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2009195348360589307

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "APlusPro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "马来语",
    "platform": "亚马逊",
    "salesRegion": "东南亚"
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "modelType": "pro",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 91. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2009195111889924005

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "APlusPro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "几何无衬线体",
    "language": "英语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "modelType": "pro",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 92. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2009195036698636204

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "APlusPro": {
        "checked": true,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "#30332E",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "韩语",
    "platform": "亚马逊",
    "salesRegion": "韩国"
  },
  "mainConfig": {
    "aspectRatio": "1:1",
    "modelType": "pro",
    "sceneType": {
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~

## 93. type=71 PRODUCT_IMAGE_SUITE / 商品套图 · case 2008849666751429111

~~~text
{
  "aPlusConfig": {
    "sceneType": {
      "A+": {
        "checked": true,
        "num": 4
      },
      "APlusPro": {
        "checked": false,
        "num": 4
      }
    }
  },
  "brandDNA": {
    "brandColor": "",
    "brandName": "",
    "customSettings": "",
    "fontStyle": "",
    "language": "西班牙语",
    "platform": "亚马逊",
    "salesRegion": "欧洲"
  },
  "mainConfig": {
    "aspectRatio": "default",
    "modelType": "pro",
    "sceneType": {
      "closeUp": {
        "checked": false,
        "num": 4
      },
      "scene": {
        "checked": true,
        "num": 4
      },
      "sellPoint": {
        "checked": true,
        "num": 4
      }
    }
  }
}
~~~
