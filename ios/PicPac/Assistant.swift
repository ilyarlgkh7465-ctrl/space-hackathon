import SwiftUI

/// Котик Пак — маленький помощник. Не навязывается: один раз здоровается после заставки и спрашивает, нужна ли помощь.
/// «Нет, спасибо» — уходит до завтра; если ничего не нажали — сам прячется через 9 секунд.
/// Спрятавшись, выглядывает из-за края маленькой мордочкой: по касанию открывается чат.
struct AssistantOverlay: View {
    @EnvironmentObject var app: AppState
    var visible: Bool                         // только на корневых экранах, чтобы не закрывать кнопки
    @AppStorage("catDeclinedDay") private var declinedDay = ""
    @State private var mode: Mode = .away
    @State private var wave = false
    @State private var showChat = false
    enum Mode { case away, greeting, docked }

    private var today: String { Date().formatted(.iso8601.year().month().day()) }

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            if mode == .greeting && visible {
                HStack(alignment: .bottom, spacing: 0) {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Мяу! Я Пак 👋").font(.system(size: 16, weight: .bold))
                        Text("Помогу выбрать подарок, оформить заказ или узнать, где он. Нужна помощь?")
                            .font(.system(size: 14.5)).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 8) {
                            Button { openChat() } label: {
                                Text("Да, помоги").font(.system(size: 14.5, weight: .semibold)).lineLimit(1).fixedSize().foregroundStyle(.white)
                                    .padding(.horizontal, 14).frame(height: 38).background(Capsule().fill(Theme.ink))
                            }
                            Button { decline() } label: {
                                Text("Нет, спасибо").font(.system(size: 14.5, weight: .semibold)).lineLimit(1).fixedSize().foregroundStyle(Theme.ink)
                                    .padding(.horizontal, 14).frame(height: 38).background(Capsule().fill(Theme.chip))
                            }
                        }.buttonStyle(PressStyle())
                    }
                    .padding(16)
                    .background(BubbleShape().fill(.white).shadow(color: .black.opacity(0.14), radius: 20, y: 8))
                    .frame(maxWidth: 262)
                    Image(uiImage: UIImage(named: "cat-point.png") ?? UIImage()).resizable().scaledToFit()
                        .frame(width: 118).rotationEffect(.degrees(wave ? -4 : 3), anchor: .bottom)
                        .offset(x: 6, y: 6)
                }
                .padding(.trailing, 6).padding(.bottom, 92)
                .transition(.asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .move(edge: .bottom).combined(with: .opacity)))
            }
            if mode == .docked && visible {
                Button { openChat() } label: {
                    Image(uiImage: UIImage(named: "cat-happy.png") ?? UIImage()).resizable().scaledToFill()
                        .frame(width: 54, height: 54).offset(x: 4, y: 6).clipShape(Circle())
                        .background(Circle().fill(Theme.peach))
                        .overlay(Circle().stroke(.white, lineWidth: 3))
                        .shadow(color: .black.opacity(0.18), radius: 10, y: 4)
                }
                .buttonStyle(PressStyle(scale: 0.9))
                .accessibilityLabel("Помощник Пак")
                .padding(.trailing, 16).padding(.bottom, 96)
                .transition(.scale(scale: 0.3, anchor: .bottomTrailing).combined(with: .opacity))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
        .sheet(isPresented: $showChat) { CatChat().environmentObject(app) }
        .task {
            try? await Task.sleep(for: .milliseconds(900))
            if declinedDay == today { withAnimation(.spring(duration: 0.5)) { mode = .docked }; return }
            withAnimation(.spring(duration: 0.6, bounce: 0.25)) { mode = .greeting }
            withAnimation(.easeInOut(duration: 0.5).repeatCount(5, autoreverses: true)) { wave = true }
            try? await Task.sleep(for: .seconds(9))
            if mode == .greeting { withAnimation(.spring(duration: 0.5)) { mode = .docked } }
        }
    }

    private func openChat() { withAnimation(.spring(duration: 0.45)) { mode = .docked }; showChat = true }
    private func decline() { declinedDay = today; withAnimation(.spring(duration: 0.5, bounce: 0.1)) { mode = .docked } }
}

/// Облачко со «хвостиком» к коту.
struct BubbleShape: Shape {
    func path(in r: CGRect) -> Path {
        var p = Path(roundedRect: r, cornerRadius: 22)
        p.move(to: CGPoint(x: r.maxX - 4, y: r.maxY - 34))
        p.addQuadCurve(to: CGPoint(x: r.maxX + 12, y: r.maxY - 18), control: CGPoint(x: r.maxX + 6, y: r.maxY - 30))
        p.addQuadCurve(to: CGPoint(x: r.maxX - 6, y: r.maxY - 16), control: CGPoint(x: r.maxX + 2, y: r.maxY - 16))
        return p
    }
}

/// Чат с котиком. Ответы — из данных приложения (заказы, каталог); всё сложное — человеку из поддержки.
struct CatChat: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var messages: [Msg] = [Msg(me: false, text: "Привет! Я Пак, помощник picPac. Спросите что угодно или выберите вариант ниже.")]
    @State private var input = ""
    struct Msg: Identifiable { let id = UUID(); let me: Bool; let text: String; var action: (String, () -> Void)? = nil }
    private let quick = ["Подобрать подарок", "Где мой заказ?", "Как загрузить фото", "Сроки и доставка"]

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Image(uiImage: UIImage(named: "cat-happy.png") ?? UIImage()).resizable().scaledToFill().frame(width: 44, height: 44).offset(y: 4).clipShape(Circle()).background(Circle().fill(Theme.peach))
                VStack(alignment: .leading, spacing: 1) { Text("Пак").font(.system(size: 17, weight: .bold)); Text("помощник picPac · отвечает сразу").font(.system(size: 12.5)).foregroundStyle(Theme.ink3) }
                Spacer()
                Button { dismiss() } label: { Image(systemName: "xmark").font(.system(size: 14, weight: .bold)).foregroundStyle(Theme.ink).frame(width: 36, height: 36).background(Circle().fill(Theme.chip)) }
            }.padding(.horizontal, 18).padding(.top, 18).padding(.bottom, 10)

            ScrollViewReader { sv in
                ScrollView(showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(messages) { m in bubble(m).id(m.id) }
                    }.padding(.horizontal, 18).padding(.vertical, 8)
                }
                .onChange(of: messages.count) { _, _ in withAnimation { sv.scrollTo(messages.last?.id, anchor: .bottom) } }
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) { ForEach(quick, id: \.self) { q in Button { ask(q) } label: { Chip(title: q) }.buttonStyle(PressStyle()) } }.padding(.horizontal, 18)
            }.padding(.vertical, 8)
            HStack(spacing: 8) {
                TextField("Спросите Пака…", text: $input).font(.system(size: 16)).padding(.horizontal, 16).frame(height: 48).background(Capsule().fill(Theme.field)).onSubmit { send() }
                Button { send() } label: { Image(systemName: "arrow.up").font(.system(size: 16, weight: .bold)).foregroundStyle(.white).frame(width: 48, height: 48).background(Circle().fill(input.isEmpty ? Theme.ink4 : Theme.ink)) }
                    .disabled(input.isEmpty).buttonStyle(PressStyle(scale: 0.9))
            }.padding(.horizontal, 18).padding(.bottom, 14)
        }
        .presentationDetents([.medium, .large])
        .presentationCornerRadius(30)
        .presentationDragIndicator(.visible)
    }

    private func bubble(_ m: Msg) -> some View {
        HStack {
            if m.me { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 8) {
                Text(m.text).font(.system(size: 15.5)).foregroundStyle(m.me ? .white : Theme.ink)
                if let a = m.action {
                    Button { a.1() } label: { Text(a.0).font(.system(size: 14, weight: .semibold)).foregroundStyle(.white).padding(.horizontal, 14).frame(height: 36).background(Capsule().fill(Theme.ink)) }.buttonStyle(PressStyle())
                }
            }
            .padding(.horizontal, 14).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: 20).fill(m.me ? Theme.ink : Theme.peach))
            if !m.me { Spacer(minLength: 40) }
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func send() { let t = input.trimmingCharacters(in: .whitespaces); guard !t.isEmpty else { return }; input = ""; ask(t) }

    private func ask(_ q: String) {
        withAnimation(.spring(duration: 0.35)) { messages.append(Msg(me: true, text: q)) }
        let s = q.lowercased()
        var reply = Msg(me: false, text: "Передам вопрос специалисту поддержки — ответим в течение 5 минут. А пока могу подсказать с заказом или подарком.")
        if s.contains("подар") || s.contains("подбер") {
            reply = Msg(me: false, text: "На праздник чаще всего берут фотокнигу или календарь на 2027 год: 12 ваших кадров — подарок на весь год. Показать календарь?",
                        action: ("Открыть календарь", { dismiss(); app.open(Catalog.by("calendar")) }))
        } else if s.contains("заказ") || s.contains("где") {
            if let o = app.orders.first, let cur = o.stages.first(where: { $0.state == 1 }) {
                reply = Msg(me: false, text: "Заказ № \(o.id) (\(o.product.name)) сейчас на этапе «\(cur.name)». Уведомлю, когда он поедет к вам.",
                            action: ("Открыть заказы", { dismiss(); app.path = NavigationPath(); app.tab = .orders }))
            } else { reply = Msg(me: false, text: "Активных заказов нет — все вручены. Хотите сделать новый?") }
        } else if s.contains("фото") || s.contains("загруз") {
            reply = Msg(me: false, text: "Нажмите чёрную кнопку «+» внизу и выберите снимки из галереи — я подскажу, что из них получится, и проверю резкость.",
                        action: ("Выбрать фото", { dismiss(); app.pickPhotos(for: .fab) }))
        } else if s.contains("срок") || s.contains("достав") {
            reply = Msg(me: false, text: "Печать — 1 день, фотокнига — 2–3 дня. Доставка Белпочтой 1–2 дня по Беларуси, самовывоз в Минске бесплатно. Платите при получении.")
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.45) { withAnimation(.spring(duration: 0.4)) { messages.append(reply) } }
    }
}
