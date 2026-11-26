// Generated from docs/ui/tokens.json. Do not edit by hand.
export const tokens = {
  "name": "workshop-pos-design-tokens",
  "version": "1.0.0",
  "date": "2026-11-26",
  "description": "Shared design contract for the Workshop POS web back-office and Android-first mobile app.",
  "units": {
    "web": "px",
    "mobile": "dp",
    "base": 4
  },
  "color": {
    "light": {
      "bg": {
        "canvas": "#F4F5F2",
        "surface": "#FFFFFF",
        "surfaceRaised": "#FFFFFF",
        "surfaceSunken": "#EDF0ED",
        "hover": "#F0F2EF",
        "selected": "#E3F1EE",
        "disabled": "#ECEFEC"
      },
      "text": {
        "primary": "#14191B",
        "secondary": "#4A5559",
        "muted": "#5F6B66",
        "inverse": "#FFFFFF",
        "disabled": "#5A6560",
        "link": "#0A5B54"
      },
      "border": {
        "subtle": "#E1E5E1",
        "default": "#C9D0CB",
        "strong": "#7C8A83"
      },
      "accent": {
        "default": "#0E6E66",
        "hover": "#0A5B54",
        "active": "#084B46",
        "subtle": "#E3F1EE",
        "onAccent": "#FFFFFF",
        "text": "#0A5B54"
      },
      "status": {
        "success": {
          "fg": "#17603A",
          "bg": "#E6F2EA",
          "border": "#9ACFAE"
        },
        "warning": {
          "fg": "#7A4A00",
          "bg": "#FDF0DA",
          "border": "#D8A94F"
        },
        "danger": {
          "fg": "#A3231B",
          "bg": "#FBE9E7",
          "border": "#D98A83"
        },
        "info": {
          "fg": "#33474D",
          "bg": "#EAF0F1",
          "border": "#9FB8BD"
        },
        "neutral": {
          "fg": "#3C4843",
          "bg": "#EDF0ED",
          "border": "#C9D0CB"
        }
      },
      "focus": {
        "ring": "#0E6E66",
        "offset": "#FFFFFF"
      },
      "overlay": {
        "scrim": "rgba(20, 25, 27, 0.72)"
      },
      "chart": {
        "categorical": [
          "#0E6E66",
          "#A15C00",
          "#3F5C8A",
          "#7B4A6B",
          "#4F6B3A",
          "#8A3B36"
        ],
        "grid": "#E1E5E1"
      }
    },
    "dark": {
      "bg": {
        "canvas": "#0F1416",
        "surface": "#171D1F",
        "surfaceRaised": "#1E2628",
        "surfaceSunken": "#0B1011",
        "hover": "#20292B",
        "selected": "#10201E",
        "disabled": "#232B2D"
      },
      "text": {
        "primary": "#E8EDEA",
        "secondary": "#A9B5B0",
        "muted": "#8C9994",
        "inverse": "#0F1416",
        "disabled": "#95A19C",
        "link": "#7FE0D1"
      },
      "border": {
        "subtle": "#2A3432",
        "default": "#3B4744",
        "strong": "#667873"
      },
      "accent": {
        "default": "#66D6C4",
        "hover": "#7FE0D1",
        "active": "#4FC2B0",
        "subtle": "#10201E",
        "onAccent": "#0B1213",
        "text": "#7FE0D1"
      },
      "status": {
        "success": {
          "fg": "#7ADFA4",
          "bg": "#122A1D",
          "border": "#2E6B45"
        },
        "warning": {
          "fg": "#F2C06B",
          "bg": "#2E2211",
          "border": "#6B4E1F"
        },
        "danger": {
          "fg": "#FF9A90",
          "bg": "#331816",
          "border": "#6B2D27"
        },
        "info": {
          "fg": "#B9D2D8",
          "bg": "#16262A",
          "border": "#2E4A50"
        },
        "neutral": {
          "fg": "#C7D2CD",
          "bg": "#232B2D",
          "border": "#3B4744"
        }
      },
      "focus": {
        "ring": "#7FE0D1",
        "offset": "#0F1416"
      },
      "overlay": {
        "scrim": "rgba(0, 0, 0, 0.70)"
      },
      "chart": {
        "categorical": [
          "#66D6C4",
          "#F2C06B",
          "#9DB4E8",
          "#E3A6CC",
          "#A9C98D",
          "#FF9A90"
        ],
        "grid": "#2A3432"
      }
    }
  },
  "lifecycle": {
    "draft": "neutral",
    "estimated": "info",
    "approved": "info",
    "inProgress": "accent",
    "completed": "warning",
    "paid": "success",
    "void": "danger",
    "pendingSync": "neutral",
    "sending": "info",
    "syncFailed": "danger",
    "needsReview": "danger",
    "synced": "success"
  },
  "typography": {
    "families": {
      "sans": {
        "name": "Inter",
        "fallback": "Inter, \"Segoe UI\", system-ui, sans-serif",
        "license": "OFL-1.1",
        "selfHosted": true
      },
      "mono": {
        "name": "IBM Plex Mono",
        "fallback": "\"IBM Plex Mono\", ui-monospace, \"SFMono-Regular\", monospace",
        "license": "OFL-1.1",
        "selfHosted": true
      }
    },
    "weights": {
      "regular": 400,
      "medium": 500,
      "semibold": 600
    },
    "scale": {
      "display": {
        "fontFamily": "sans",
        "size": 30,
        "lineHeight": 38,
        "weight": 600,
        "letterSpacing": -0.3
      },
      "title.lg": {
        "fontFamily": "sans",
        "size": 24,
        "lineHeight": 32,
        "weight": 600,
        "letterSpacing": -0.2
      },
      "title.md": {
        "fontFamily": "sans",
        "size": 20,
        "lineHeight": 28,
        "weight": 600,
        "letterSpacing": -0.1
      },
      "title.sm": {
        "fontFamily": "sans",
        "size": 18,
        "lineHeight": 26,
        "weight": 600,
        "letterSpacing": 0
      },
      "body.lg": {
        "fontFamily": "sans",
        "size": 16,
        "lineHeight": 24,
        "weight": 400,
        "letterSpacing": 0
      },
      "body": {
        "fontFamily": "sans",
        "size": 14,
        "lineHeight": 20,
        "weight": 400,
        "letterSpacing": 0
      },
      "body.strong": {
        "fontFamily": "sans",
        "size": 14,
        "lineHeight": 20,
        "weight": 600,
        "letterSpacing": 0
      },
      "label": {
        "fontFamily": "sans",
        "size": 13,
        "lineHeight": 18,
        "weight": 500,
        "letterSpacing": 0
      },
      "table": {
        "fontFamily": "sans",
        "size": 13,
        "lineHeight": 18,
        "weight": 400,
        "letterSpacing": 0
      },
      "table.header": {
        "fontFamily": "sans",
        "size": 12,
        "lineHeight": 16,
        "weight": 600,
        "letterSpacing": 0.1
      },
      "caption": {
        "fontFamily": "sans",
        "size": 12,
        "lineHeight": 16,
        "weight": 400,
        "letterSpacing": 0
      },
      "numeric.xl": {
        "fontFamily": "sans",
        "size": 28,
        "lineHeight": 34,
        "weight": 600,
        "letterSpacing": -0.2
      },
      "numeric.lg": {
        "fontFamily": "sans",
        "size": 20,
        "lineHeight": 26,
        "weight": 600,
        "letterSpacing": 0
      },
      "mono": {
        "fontFamily": "mono",
        "size": 13,
        "lineHeight": 18,
        "weight": 400,
        "letterSpacing": 0
      },
      "receipt": {
        "fontFamily": "mono",
        "size": 12,
        "lineHeight": 16,
        "weight": 400,
        "letterSpacing": 0
      }
    },
    "features": {
      "tabularNumeric": "\"tnum\" 1, \"lnum\" 1",
      "plateLetterSpacing": "0.04em",
      "plateWeight": 500
    }
  },
  "spacing": {
    "0": 0,
    "2": 2,
    "4": 4,
    "8": 8,
    "12": 12,
    "16": 16,
    "20": 20,
    "24": 24,
    "32": 32,
    "40": 40,
    "48": 48,
    "64": 64,
    "80": 80
  },
  "radius": {
    "none": 0,
    "xs": 2,
    "sm": 4,
    "md": 6,
    "lg": 8,
    "xl": 16,
    "full": 999
  },
  "border": {
    "width": {
      "hairline": 1,
      "default": 1,
      "strong": 1,
      "rail": 3,
      "focus": 2,
      "focusOffset": 2
    }
  },
  "elevation": {
    "light": {
      "0": {
        "layers": []
      },
      "1": {
        "layers": [
          {
            "x": 0,
            "y": 1,
            "blur": 2,
            "spread": 0,
            "color": "rgba(20, 25, 27, 0.06)",
            "inset": false
          }
        ]
      },
      "2": {
        "layers": [
          {
            "x": 0,
            "y": 8,
            "blur": 24,
            "spread": -12,
            "color": "rgba(20, 25, 27, 0.28)",
            "inset": false
          }
        ]
      },
      "3": {
        "layers": [
          {
            "x": 0,
            "y": 24,
            "blur": 64,
            "spread": -24,
            "color": "rgba(20, 25, 27, 0.36)",
            "inset": false
          }
        ]
      }
    },
    "dark": {
      "0": {
        "layers": []
      },
      "1": {
        "layers": [
          {
            "x": 0,
            "y": 0,
            "blur": 0,
            "spread": 1,
            "color": "#2A3432",
            "inset": true
          }
        ]
      },
      "2": {
        "layers": [
          {
            "x": 0,
            "y": 8,
            "blur": 24,
            "spread": -12,
            "color": "rgba(0, 0, 0, 0.60)",
            "inset": false
          }
        ]
      },
      "3": {
        "layers": [
          {
            "x": 0,
            "y": 24,
            "blur": 64,
            "spread": -24,
            "color": "rgba(0, 0, 0, 0.72)",
            "inset": false
          }
        ]
      }
    }
  },
  "motion": {
    "duration": {
      "instant": 80,
      "fast": 120,
      "base": 180,
      "slow": 240,
      "highlight": 600,
      "reduced": 0
    },
    "easing": {
      "standard": [
        0.2,
        0,
        0,
        1
      ],
      "exit": [
        0.4,
        0,
        1,
        1
      ]
    }
  },
  "breakpoints": {
    "sm": 480,
    "md": 768,
    "lg": 1024,
    "xl": 1280,
    "2xl": 1536
  },
  "viewport": {
    "mobileCompact": 360,
    "mobileStandard": 390,
    "mobileLarge": 412,
    "tablet": 768,
    "desktop": 1280
  },
  "zIndex": {
    "base": 0,
    "sticky": 10,
    "dropdown": 20,
    "overlay": 30,
    "drawer": 40,
    "modal": 50,
    "toast": 60,
    "tooltip": 70,
    "skipLink": 80
  },
  "size": {
    "targetWeb": 44,
    "targetMobile": 48,
    "primaryMobile": 56,
    "controlWebSm": 32,
    "controlWebMd": 36,
    "controlWebLg": 40,
    "controlWebPrimary": 44,
    "controlWebForm": 44,
    "navItem": 44,
    "rowWeb": 44,
    "rowWebCompact": 40,
    "rowMobile": 56,
    "sidebar": 264,
    "sidebarCollapsed": 72,
    "sidebarDrawer": 280,
    "topbar": 56,
    "pageHeader": 72,
    "filterBar": 56,
    "drawer": 480,
    "modal": 560,
    "modalDestructive": 480,
    "toast": 360,
    "mobileHeader": 56,
    "mobileBanner": 40,
    "mobileTabBar": 64,
    "mobileActionBar": 64,
    "keypadKey": 56,
    "iconSm": 16,
    "iconMd": 20,
    "iconLg": 24,
    "iconEmpty": 32,
    "emptyIconSquare": 40,
    "scrollPaddingBottom": 96,
    "contentMax": 1440
  },
  "a11y": {
    "target": "WCAG 2.2 AA",
    "minBodyContrast": 4.5,
    "minLargeTextContrast": 3,
    "minUiContrast": 3,
    "minTargetWeb": 44,
    "minTargetMobile": 48,
    "primaryTargetMobile": 56,
    "verifiedPairs": {
      "light": {
        "text.primary/bg.surface": 17.73,
        "text.primary/bg.canvas": 16.2,
        "text.secondary/bg.surface": 7.68,
        "text.muted/bg.surface": 5.55,
        "accent.default/bg.surface": 6.1,
        "accent.text/bg.surface": 7.96,
        "accent.default/bg.canvas": 5.58,
        "accent.text/bg.canvas": 7.28,
        "accent.onAccent/accent.default": 6.1,
        "accent.text/accent.subtle": 6.86,
        "text.disabled/bg.disabled": 5.23,
        "border.strong/bg.surface": 3.61,
        "border.strong/bg.canvas": 3.3,
        "border.strong/bg.surfaceSunken": 3.14,
        "focus.ring/bg.surface": 6.1,
        "status.success": 6.59,
        "status.warning": 6.65,
        "status.danger": 6.37,
        "status.info": 8.48,
        "status.neutral": 8.31
      },
      "dark": {
        "text.primary/bg.surface": 14.39,
        "text.primary/bg.canvas": 15.67,
        "text.secondary/bg.surface": 8.06,
        "text.muted/bg.surface": 5.76,
        "accent.default/bg.surface": 9.72,
        "accent.text/bg.surface": 10.95,
        "accent.default/bg.canvas": 10.58,
        "accent.text/bg.canvas": 11.91,
        "accent.onAccent/accent.default": 10.79,
        "accent.text/accent.subtle": 10.81,
        "text.muted/bg.surfaceRaised": 5.21,
        "border.strong/bg.surface": 3.65,
        "border.strong/bg.surfaceRaised": 3.3,
        "focus.ring/bg.surface": 10.95,
        "status.success": 9.4,
        "status.warning": 9.26,
        "status.danger": 8.01,
        "status.info": 9.87,
        "status.neutral": 9.3
      }
    }
  }
} as const;

export type DesignTokens = typeof tokens;
