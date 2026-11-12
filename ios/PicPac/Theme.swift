import SwiftUI

/// Цвета picPac: монохром + фирменный красный только для акцентов (счётчики, «нравится», логотип).
enum Theme {
    static let ink = Color(hex: 0x0E0E10)
    static let ink2 = Color(hex: 0x3A3A3F)
    static let ink3 = Color(hex: 0x6E6E76)
    static let ink4 = Color(hex: 0xA3A3AB)
    static let red = Color(hex: 0xE2373D)
    static let redSoft = Color(hex: 0xFDECEC)
    static let field = Color(hex: 0xF4F4F6)
    static let chip = Color(hex: 0xF2F2F4)
    static let line = Color(hex: 0xECECEF)
    static let canvas = Color.white
    static let star = Color(hex: 0xF2A91E)
    // немного цвета: тёплые пастельные подложки, как блоки на сайте picPac, и рыжий котика
    static let peach = Color(hex: 0xFFEADB)
    static let sky = Color(hex: 0xE3EDFC)
    static let mint = Color(hex: 0xE1F3E8)
    static let lilac = Color(hex: 0xEEE6FA)
    static let butter = Color(hex: 0xFFF3CF)
    static let orange = Color(hex: 0xF39A2E)
}

extension Color {
    init(hex: UInt32, alpha: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255, opacity: alpha)
    }
}

/// Нажатие: кнопка чуть сжимается в момент касания, как у системных элементов.
struct PressStyle: ButtonStyle {
    var scale: CGFloat = 0.96
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? scale : 1)
            .animation(.spring(duration: 0.18, bounce: 0.3), value: configuration.isPressed)
    }
}

/// Круглая белая кнопка с тенью — «назад», «поделиться», колокольчик.
struct RoundIcon: View {
    let symbol: String
    var badge: Bool = false
    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: 16, weight: .semibold))
            .foregroundStyle(Theme.ink)
            .frame(width: 44, height: 44)
            .background(Circle().fill(.white).shadow(color: .black.opacity(0.08), radius: 10, y: 4))
            .overlay(alignment: .topTrailing) {
                if badge { Circle().fill(Theme.red).frame(width: 10, height: 10).overlay(Circle().stroke(.white, lineWidth: 2)).offset(x: -8, y: 9) }
            }
    }
}

/// Чип-фильтр: серый, выбранный — чёрный.
struct Chip: View {
    let title: String
    var selected = false
    var icon: String? = nil
    var body: some View {
        HStack(spacing: 6) {
            if let icon { Image(systemName: icon).font(.system(size: 13, weight: .semibold)) }
            Text(title).font(.system(size: 14.5, weight: .semibold))
        }
        .padding(.horizontal, 15).frame(height: 38)
        .foregroundStyle(selected ? .white : Theme.ink)
        .background(Capsule().fill(selected ? Theme.ink : Theme.chip))
    }
}

/// Чёрная кнопка-«таблетка».
struct PillButton: View {
    let title: String
    var dark = true
    var body: some View {
        Text(title).font(.system(size: 16.5, weight: .semibold))
            .frame(maxWidth: .infinity).frame(height: 56)
            .foregroundStyle(dark ? .white : Theme.ink)
            .background(Capsule().fill(dark ? Theme.ink : Theme.chip))
    }
}

func money(_ v: Double) -> String {
    let f = NumberFormatter()
    f.locale = Locale(identifier: "ru_RU"); f.minimumFractionDigits = 2; f.maximumFractionDigits = 2
    return (f.string(from: NSNumber(value: v)) ?? "\(v)") + " BYN"
}
