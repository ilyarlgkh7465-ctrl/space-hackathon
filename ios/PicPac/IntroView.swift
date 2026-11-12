import SwiftUI

/// Заставка: логотип picPac «пишется» пером слева направо на белом → уезжает вверх и белеет, фон темнеет
/// с красным свечением снизу → по очереди выходят текст и кнопки входа. Касание ускоряет.
struct IntroView: View {
    enum Entry { case newClient, returning, guest }
    var onFinish: (Entry) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var written: CGFloat = 0     // доля «написанного» логотипа
    @State private var choose = false
    @State private var copyIn = false
    @State private var buttonsIn = false
    @State private var leaving = false

    private let logoW: CGFloat = 214
    private var logoH: CGFloat { logoW * 115 / 222 }

    var body: some View {
        GeometryReader { geo in
            ZStack {
                Color.white
                ZStack {                                      // тёмный фон включаем прозрачностью
                    Theme.ink
                    RadialGradient(colors: [Theme.red.opacity(0.45), .clear], center: UnitPoint(x: 0.5, y: 1.12), startRadius: 0, endRadius: geo.size.height * 0.62)
                    RadialGradient(colors: [.white.opacity(0.07), .clear], center: UnitPoint(x: 0.85, y: -0.1), startRadius: 0, endRadius: geo.size.width)
                }
                .opacity(choose ? 1 : 0)

                Image(uiImage: UIImage(named: "picpac-logo-mask.png") ?? UIImage()).resizable().renderingMode(.template).interpolation(.high)
                    .foregroundStyle(choose ? Color.white : Theme.red)
                    .frame(width: logoW, height: logoH)
                    .mask(alignment: .leading) { Rectangle().frame(width: logoW * written) }
                    .scaleEffect(choose ? 0.78 : 0.92 + 0.08 * written)
                    .offset(y: choose ? -geo.size.height * 0.22 : 0)
                    .accessibilityLabel("picPac")

                VStack(spacing: 10) {
                    Text("Ваши фото — в печать\nза пару касаний").font(.system(size: 29, weight: .bold)).tracking(-0.8)
                        .multilineTextAlignment(.center).foregroundStyle(.white)
                    Text("Фотокниги, печать, календари и холсты от «Фотопринта». Доставка по Беларуси.")
                        .font(.system(size: 15)).multilineTextAlignment(.center).foregroundStyle(.white.opacity(0.62))
                }
                .padding(.horizontal, 28)
                .offset(y: copyIn ? 8 : 26).opacity(copyIn ? 1 : 0)

                VStack(spacing: 10) {
                    Button { leave(.newClient) } label: { Text("Я новый клиент").font(.system(size: 16.5, weight: .semibold)).frame(maxWidth: .infinity).frame(height: 56).foregroundStyle(Theme.ink).background(Capsule().fill(Color.white)) }
                    Button { leave(.returning) } label: {
                        Text("Я уже заказывал").font(.system(size: 16.5, weight: .semibold)).frame(maxWidth: .infinity).frame(height: 56)
                            .foregroundStyle(.white).overlay(Capsule().stroke(.white.opacity(0.34), lineWidth: 1.5))
                    }
                    Button { leave(.guest) } label: { Text("Посмотреть без входа").font(.system(size: 14.5, weight: .medium)).foregroundStyle(.white.opacity(0.55)).frame(height: 44) }
                }
                .buttonStyle(PressStyle())
                .padding(.horizontal, 24)
                .frame(maxHeight: .infinity, alignment: .bottom)
                .padding(.bottom, geo.safeAreaInsets.bottom + 12)
                .offset(y: buttonsIn ? 0 : 40).opacity(buttonsIn ? 1 : 0)
                .allowsHitTesting(buttonsIn)
            }
            .opacity(leaving ? 0 : 1)
            .scaleEffect(leaving ? 1.04 : 1)
            .contentShape(Rectangle())
            .onTapGesture { if !choose { showChoice() } }
        }
        .ignoresSafeArea()
        .preferredColorScheme(choose ? .dark : .light)
        .task { await run() }
    }

    private func run() async {
        if reduceMotion {
            written = 1
            try? await Task.sleep(for: .milliseconds(600))
        } else {
            try? await Task.sleep(for: .milliseconds(150))
            withAnimation(.timingCurve(0.65, 0, 0.35, 1, duration: 1.05)) { written = 1 }   // ход пера: медленно → быстро → медленно
            try? await Task.sleep(for: .milliseconds(1450))
        }
        showChoice()
    }

    private func showChoice() {
        guard !choose else { return }
        written = 1
        withAnimation(reduceMotion ? .easeOut(duration: 0.25) : .spring(duration: 0.75, bounce: 0.12)) { choose = true }
        withAnimation(reduceMotion ? .easeOut(duration: 0.25) : .spring(duration: 0.6, bounce: 0.1).delay(0.16)) { copyIn = true }
        withAnimation(reduceMotion ? .easeOut(duration: 0.25) : .spring(duration: 0.65, bounce: 0.14).delay(0.28)) { buttonsIn = true }
    }

    private func leave(_ e: Entry) {
        withAnimation(.easeIn(duration: 0.28)) { leaving = true }      // уход быстрее входа
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { onFinish(e) }
    }
}
