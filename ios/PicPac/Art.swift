import SwiftUI

/// «Фотографии» без чужих снимков: сцены рисуются кодом (закат, горы, озеро, город, цветы, кофе),
/// а поверх — макет продукта picPac (книга, отпечатки, календарь, холст, магнит), как на столе в студии.
enum PhotoScene: CaseIterable { case sunset, mountains, lake, city, flower, coffee }

struct SceneArt: View {
    let scene: PhotoScene
    var body: some View {
        Canvas { ctx, size in
            let w = size.width, h = size.height
            func rect(_ g: Gradient) { ctx.fill(Path(CGRect(origin: .zero, size: size)), with: .linearGradient(g, startPoint: .zero, endPoint: CGPoint(x: 0, y: h))) }
            func hills(_ y: CGFloat, _ amp: CGFloat, _ color: Color, _ seed: CGFloat) {
                var p = Path(); p.move(to: CGPoint(x: 0, y: h))
                stride(from: 0, through: w, by: w / 24).forEach { x in
                    p.addLine(to: CGPoint(x: x, y: y + sin(x / w * 6 + seed) * amp + cos(x / w * 13 + seed * 2) * amp * 0.4))
                }
                p.addLine(to: CGPoint(x: w, y: h)); p.closeSubpath(); ctx.fill(p, with: .color(color))
            }
            switch scene {
            case .sunset:
                rect(Gradient(colors: [Color(hex: 0x2B2D5C), Color(hex: 0xC4607A), Color(hex: 0xF4B36C)]))
                ctx.fill(Path(ellipseIn: CGRect(x: w * 0.38, y: h * 0.42, width: w * 0.24, height: w * 0.24)), with: .color(Color(hex: 0xFFE2A8)))
                hills(h * 0.62, h * 0.04, Color(hex: 0x3A2D4F), 1); hills(h * 0.74, h * 0.03, Color(hex: 0x1F1A2E), 3)
            case .mountains:
                rect(Gradient(colors: [Color(hex: 0x9EC3E6), Color(hex: 0xE4EEF6)]))
                var m = Path(); m.move(to: CGPoint(x: 0, y: h * 0.7)); m.addLine(to: CGPoint(x: w * 0.3, y: h * 0.28)); m.addLine(to: CGPoint(x: w * 0.52, y: h * 0.56))
                m.addLine(to: CGPoint(x: w * 0.72, y: h * 0.22)); m.addLine(to: CGPoint(x: w, y: h * 0.62)); m.addLine(to: CGPoint(x: w, y: h)); m.addLine(to: CGPoint(x: 0, y: h))
                ctx.fill(m, with: .color(Color(hex: 0x56657A)))
                hills(h * 0.78, h * 0.03, Color(hex: 0x3F6B4A), 2)
            case .lake:
                rect(Gradient(colors: [Color(hex: 0xF6D6B8), Color(hex: 0xA9B7D8)]))
                hills(h * 0.5, h * 0.05, Color(hex: 0x5A6B8E), 0.5)
                ctx.fill(Path(CGRect(x: 0, y: h * 0.58, width: w, height: h * 0.42)), with: .linearGradient(Gradient(colors: [Color(hex: 0x3D4A70), Color(hex: 0x27304C)]), startPoint: CGPoint(x: 0, y: h * 0.58), endPoint: CGPoint(x: 0, y: h)))
                for i in 0..<6 { ctx.fill(Path(CGRect(x: w * (0.2 + CGFloat(i) * 0.1), y: h * (0.64 + CGFloat(i % 3) * 0.08), width: w * 0.12, height: 1.5)), with: .color(.white.opacity(0.35))) }
            case .city:
                rect(Gradient(colors: [Color(hex: 0x2C3557), Color(hex: 0x8C7DA8), Color(hex: 0xE9B98F)]))
                var x: CGFloat = 0, i: CGFloat = 0
                while x < w { let bw = w * (0.08 + (i.truncatingRemainder(dividingBy: 3)) * 0.03), bh = h * (0.25 + (i * 7).truncatingRemainder(dividingBy: 5) * 0.07)
                    ctx.fill(Path(CGRect(x: x, y: h - bh, width: bw - 2, height: bh)), with: .color(Color(hex: 0x1E2236))); x += bw; i += 1 }
            case .flower:
                rect(Gradient(colors: [Color(hex: 0xE9F1E4), Color(hex: 0xBFD8B8)]))
                for k in 0..<7 { let a = CGFloat(k) / 7 * .pi * 2, c = CGPoint(x: w * 0.5 + cos(a) * w * 0.13, y: h * 0.45 + sin(a) * w * 0.13)
                    ctx.fill(Path(ellipseIn: CGRect(x: c.x - w * 0.1, y: c.y - w * 0.1, width: w * 0.2, height: w * 0.2)), with: .color(Color(hex: 0xF08FA8))) }
                ctx.fill(Path(ellipseIn: CGRect(x: w * 0.44, y: h * 0.45 - w * 0.06, width: w * 0.12, height: w * 0.12)), with: .color(Color(hex: 0xF7C948)))
            case .coffee:
                rect(Gradient(colors: [Color(hex: 0x8A5A3C), Color(hex: 0x5C3A26)]))
                ctx.fill(Path(ellipseIn: CGRect(x: w * 0.25, y: h * 0.25, width: w * 0.5, height: w * 0.5)), with: .color(Color(hex: 0xF4ECE2)))
                ctx.fill(Path(ellipseIn: CGRect(x: w * 0.31, y: h * 0.25 + w * 0.06, width: w * 0.38, height: w * 0.38)), with: .color(Color(hex: 0x6B4127)))
            }
        }
    }
}

enum ProductKind { case book, prints, calendar, canvas, magnet }

/// Продукт на светлом «столе»: внутри — сцена.
struct ProductArt: View {
    let kind: ProductKind
    let scene: PhotoScene
    var photo: String? = nil
    private var tint: Color {
        switch kind { case .book: return Theme.peach; case .prints: return Theme.sky; case .calendar: return Theme.mint; case .canvas: return Theme.lilac; case .magnet: return Theme.butter }
    }
    var body: some View {
        if let photo, let img = UIImage(named: photo + ".jpg") {
            Color(Theme.chip).overlay(Image(uiImage: img).resizable().scaledToFill()).clipped()   // настоящее фото (Unsplash)
        } else { drawn }
    }
    private var drawn: some View {
        GeometryReader { g in
            let s = min(g.size.width, g.size.height)
            ZStack {
                LinearGradient(colors: [tint, tint.opacity(0.75)], startPoint: .topLeading, endPoint: .bottomTrailing)
                switch kind {
                case .book:
                    SceneArt(scene: scene).frame(width: s * 0.56, height: s * 0.56)
                        .clipShape(UnevenRoundedRectangle(cornerRadii: .init(topLeading: 3, bottomLeading: 3, bottomTrailing: 8, topTrailing: 8)))
                        .overlay(alignment: .leading) { Rectangle().fill(Theme.ink).frame(width: s * 0.035) }
                        .shadow(color: .black.opacity(0.28), radius: 14, x: 6, y: 12)
                case .prints:
                    ZStack {
                        SceneArt(scene: .mountains).frame(width: s * 0.36, height: s * 0.48).border(.white, width: 4).rotationEffect(.degrees(-11)).offset(x: -s * 0.18)
                        SceneArt(scene: .lake).frame(width: s * 0.48, height: s * 0.36).border(.white, width: 4).rotationEffect(.degrees(5)).offset(y: s * 0.04)
                        SceneArt(scene: scene).frame(width: s * 0.36, height: s * 0.48).border(.white, width: 4).rotationEffect(.degrees(12)).offset(x: s * 0.2, y: -s * 0.02)
                    }.shadow(color: .black.opacity(0.22), radius: 10, y: 8)
                case .calendar:
                    VStack(spacing: 0) {
                        SceneArt(scene: scene).frame(width: s * 0.48, height: s * 0.32)
                        Grid(horizontalSpacing: 3, verticalSpacing: 3) {
                            ForEach(0..<4, id: \.self) { _ in GridRow { ForEach(0..<7, id: \.self) { _ in Rectangle().fill(Color(hex: 0xE6E6EA)).frame(height: s * 0.035) } } }
                        }.padding(6).frame(width: s * 0.48).background(.white)
                    }.clipShape(RoundedRectangle(cornerRadius: 5)).shadow(color: .black.opacity(0.22), radius: 12, y: 10)
                case .canvas:
                    SceneArt(scene: scene).frame(width: s * 0.44, height: s * 0.6)
                        .shadow(color: .black.opacity(0.3), radius: 2, x: 5, y: 5).shadow(color: .black.opacity(0.2), radius: 14, y: 12)
                case .magnet:
                    SceneArt(scene: scene).frame(width: s * 0.4, height: s * 0.4).clipShape(RoundedRectangle(cornerRadius: 12))
                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(.white, lineWidth: 5)).rotationEffect(.degrees(-5))
                        .shadow(color: .black.opacity(0.25), radius: 12, y: 10)
                }
            }
        }
    }
}
