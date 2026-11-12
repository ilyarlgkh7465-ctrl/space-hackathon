import SwiftUI
import PhotosUI

@main
struct PicPacApp: App {
    var body: some Scene {
        WindowGroup { RootView() }
    }
}

enum AppTab: String, CaseIterable { case home, ideas, orders, profile }

struct RootView: View {
    @StateObject private var app = AppState()
    @State private var introDone = false
    @State private var showLogin = false

    var body: some View {
        ZStack {
            NavigationStack(path: $app.path) {
                ZStack(alignment: .bottom) {
                    Group {
                        switch app.tab {
                        case .home: HomeView()
                        case .ideas: IdeasView()
                        case .orders: OrdersView()
                        case .profile: ProfileView()
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    TabBar()
                }
                .background(Theme.canvas)
                .navigationDestination(for: Product.self) { ProductView(product: $0) }
                .toolbar(.hidden, for: .navigationBar)
            }
            .tint(Theme.ink)

            if introDone { AssistantOverlay(visible: app.path.isEmpty) }

            if let t = app.toast {
                Text(t).font(.system(size: 15, weight: .semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 18).frame(height: 44).background(Capsule().fill(Theme.ink))
                    .frame(maxHeight: .infinity, alignment: .top).padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }

            if !introDone {
                IntroView { entry in
                    switch entry {
                    case .newClient: app.userName = "друг"
                    case .returning: showLogin = true
                    case .guest: app.userName = "гость"
                    }
                    introDone = true
                }
                .zIndex(2)
            }
        }
        .environmentObject(app)
        .photosPicker(isPresented: $app.showPicker, selection: $app.pickerItems, maxSelectionCount: 60, matching: .images)
        .onChange(of: app.pickerItems) { _, items in Task { await app.loadPicked(items) } }
        .sheet(isPresented: $showLogin) { LoginSheet { name in app.userName = name; showLogin = false } }
        .sheet(isPresented: $app.showUpload) { UploadSheet().environmentObject(app) }
        .sheet(item: $app.checkout) { p in CheckoutSheet(product: p).environmentObject(app) }
        .sheet(isPresented: $app.showNotes) { NotesSheet().environmentObject(app) }
    }
}

/// Вход для тех, кто уже заказывал: номер телефона → код. Демо: любой код подходит.
struct LoginSheet: View {
    var done: (String) -> Void
    @State private var phone = "+375 29 "
    @State private var sent = false
    @State private var code = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("С возвращением").font(.system(size: 26, weight: .bold)).tracking(-0.6)
            Text(sent ? "Отправили код на \(phone). Введите его — и продолжим с того места, где остановились." : "Введите номер телефона, на который оформляли заказы.")
                .font(.system(size: 15)).foregroundStyle(Theme.ink3)
            TextField("Телефон", text: $phone).keyboardType(.phonePad).font(.system(size: 17)).padding(.horizontal, 16).frame(height: 54)
                .background(RoundedRectangle(cornerRadius: 14).fill(Theme.field))
            if sent {
                TextField("Код из СМС", text: $code).keyboardType(.numberPad).font(.system(size: 17)).padding(.horizontal, 16).frame(height: 54)
                    .background(RoundedRectangle(cornerRadius: 14).fill(Theme.field))
            }
            Spacer(minLength: 0)
            Button { if sent { done("Анна") } else { withAnimation(.spring(duration: 0.4)) { sent = true } } } label: { PillButton(title: sent ? "Войти" : "Получить код") }
                .buttonStyle(PressStyle())
            Text("Демо: код не отправляется, подойдёт любой.").font(.system(size: 12.5)).foregroundStyle(Theme.ink4).frame(maxWidth: .infinity)
        }
        .padding(24)
        .presentationDetents([.medium])
        .presentationCornerRadius(30)
        .presentationDragIndicator(.visible)
    }
}

/// Нижняя панель: белая «таблетка», выбранная вкладка — чёрная с подписью; справа — красная кнопка «+» (выбрать фото).
struct TabBar: View {
    @EnvironmentObject var app: AppState
    @Namespace private var ns
    private let items: [(AppTab, String, String)] = [(.home, "house", "Главная"), (.ideas, "heart", "Идеи"), (.orders, "shippingbox", "Заказы"), (.profile, "person", "Профиль")]
    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 2) {
                ForEach(items, id: \.0) { item in
                    let on = app.tab == item.0
                    Button { withAnimation(.spring(duration: 0.42, bounce: 0.18)) { app.tab = item.0 } } label: {
                        HStack(spacing: 6) {
                            Image(systemName: on ? item.1 + ".fill" : item.1).font(.system(size: 17, weight: .semibold))
                            if on { Text(item.2).font(.system(size: 14, weight: .semibold)).fixedSize() }
                        }
                        .foregroundStyle(on ? .white : Theme.ink)
                        .padding(.horizontal, on ? 16 : 13).frame(height: 48)
                        .background { if on { Capsule().fill(Theme.ink).matchedGeometryEffect(id: "pill", in: ns) } }
                        .overlay(alignment: .topTrailing) {
                            if item.0 == .orders && !on && app.orders.contains(where: { $0.stages.contains { $0.state == 1 } }) {
                                Circle().fill(Theme.red).frame(width: 8, height: 8).offset(x: -8, y: 10)
                            }
                        }
                    }
                    .buttonStyle(PressStyle(scale: 0.94))
                    .accessibilityLabel(item.2)
                }
            }
            .padding(5)
            .background(Capsule().fill(.white).shadow(color: .black.opacity(0.12), radius: 18, y: 8))
            .overlay(Capsule().stroke(Theme.line, lineWidth: 1))

            Button { app.pickPhotos(for: .fab) } label: {
                Image(systemName: "plus").font(.system(size: 21, weight: .bold)).foregroundStyle(.white)
                    .frame(width: 58, height: 58).background(Circle().fill(Theme.red).shadow(color: Theme.red.opacity(0.35), radius: 12, y: 6))
            }
            .buttonStyle(PressStyle(scale: 0.9))
            .accessibilityLabel("Выбрать фото")
        }
        .padding(.bottom, 6)
    }
}
