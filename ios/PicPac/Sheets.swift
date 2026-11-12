import SwiftUI

/// После кнопки «+»: что сделать из выбранных фото.
struct UploadSheet: View {
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Что сделаем из \(app.photoCount) фото?").font(.system(size: 22, weight: .bold)).tracking(-0.5).padding(.top, 8)
            ThumbStrip()
            ForEach(Catalog.products.prefix(5)) { p in
                Button { dismiss(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { app.open(p) } } label: {
                    HStack(spacing: 12) {
                        ProductArt(kind: p.kind, scene: p.scene, photo: p.photo).frame(width: 52, height: 52).clipShape(RoundedRectangle(cornerRadius: 14))
                        VStack(alignment: .leading, spacing: 2) { Text(p.name).font(.system(size: 16, weight: .semibold)); Text(p.short).font(.system(size: 13)).foregroundStyle(Theme.ink3) }
                        Spacer()
                        Text("от " + money(p.price)).font(.system(size: 14, weight: .semibold))
                    }.foregroundStyle(Theme.ink)
                }.buttonStyle(PressStyle(scale: 0.98))
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .presentationDetents([.large])
        .presentationCornerRadius(30)
        .presentationDragIndicator(.visible)
    }
}

struct ThumbStrip: View {
    @EnvironmentObject var app: AppState
    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(app.thumbs.indices, id: \.self) { i in Image(uiImage: app.thumbs[i]).resizable().scaledToFill().frame(width: 72, height: 72).clipShape(RoundedRectangle(cornerRadius: 14)) }
                if app.photoCount > app.thumbs.count {
                    Text("+\(app.photoCount - app.thumbs.count)").font(.system(size: 15, weight: .semibold)).frame(width: 72, height: 72).background(RoundedRectangle(cornerRadius: 14).fill(Theme.chip))
                }
            }
        }
    }
}

/// Оформление: фото, получение, итог. Деньги не списываются — оплата при получении.
struct CheckoutSheet: View {
    @EnvironmentObject var app: AppState
    let product: Product
    @State private var delivery = 0
    private let ways = ["Белпочта · 1–2 дня", "Самовывоз в Минске"]
    private var total: Double { (product.unit == "/фото" ? product.price * Double(max(1, app.photoCount)) : product.price) + (delivery == 0 ? 4.5 : 0) }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Оформление").font(.system(size: 24, weight: .bold)).tracking(-0.5).padding(.top, 8)
            HStack(spacing: 12) {
                ProductArt(kind: product.kind, scene: product.scene, photo: product.photo).frame(width: 64, height: 64).clipShape(RoundedRectangle(cornerRadius: 16))
                VStack(alignment: .leading, spacing: 2) { Text(product.name).font(.system(size: 17, weight: .semibold)); Text("\(app.photoCount) фото · макет соберём сами").font(.system(size: 13.5)).foregroundStyle(Theme.ink3) }
            }
            ThumbStrip()
            VStack(alignment: .leading, spacing: 8) {
                Text("Получение").font(.system(size: 15, weight: .semibold))
                ForEach(ways.indices, id: \.self) { i in
                    Button { withAnimation(.snappy) { delivery = i } } label: {
                        HStack { Text(ways[i]).font(.system(size: 15.5)); Spacer(); Text(i == 0 ? "4,50 BYN" : "бесплатно").foregroundStyle(Theme.ink3)
                            Image(systemName: delivery == i ? "largecircle.fill.circle" : "circle").foregroundStyle(delivery == i ? Theme.ink : Theme.ink4) }
                        .foregroundStyle(Theme.ink).padding(.horizontal, 14).frame(height: 52)
                        .background(RoundedRectangle(cornerRadius: 16).stroke(delivery == i ? Theme.ink : Theme.line, lineWidth: 1.5))
                    }.buttonStyle(PressStyle(scale: 0.98))
                }
            }
            HStack { Text("Итого").font(.system(size: 17, weight: .semibold)); Spacer(); Text(money(total)).font(.system(size: 22, weight: .bold)).contentTransition(.numericText()) }
            Text("Оплата при получении — сейчас ничего не списываем.").font(.system(size: 13)).foregroundStyle(Theme.ink3)
            Spacer(minLength: 0)
            Button { app.placeOrder(product, total: total, delivery: ways[delivery]) } label: { PillButton(title: "Оформить заказ") }.buttonStyle(PressStyle())
        }
        .padding(20)
        .presentationDetents([.large])
        .presentationCornerRadius(30)
        .presentationDragIndicator(.visible)
    }
}

struct NotesSheet: View {
    @EnvironmentObject var app: AppState
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Уведомления").font(.system(size: 22, weight: .bold)).padding(.top, 8)
            ForEach(app.notes) { n in
                HStack(alignment: .top, spacing: 12) {
                    Circle().fill(Theme.red).frame(width: 8, height: 8).padding(.top, 7)
                    VStack(alignment: .leading, spacing: 2) { Text(n.title).font(.system(size: 15.5, weight: .semibold)); Text(n.text).font(.system(size: 14)).foregroundStyle(Theme.ink3) }
                    Spacer(); Text(n.time).font(.system(size: 12.5, design: .monospaced)).foregroundStyle(Theme.ink3)
                }.padding(14).background(RoundedRectangle(cornerRadius: 18).fill(Theme.field))
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .presentationDetents([.medium, .large])
        .presentationCornerRadius(30)
        .presentationDragIndicator(.visible)
        .onAppear { app.unread = 0 }
    }
}

/// Простые страницы профиля.
struct ProfileDetail: View {
    let title: String
    @AppStorage("notifyOrders") private var notify = true
    @AppStorage("catDeclinedDay") private var declinedDay = ""
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(title).font(.system(size: 22, weight: .bold)).padding(.top, 8)
            switch title {
            case "Адреса доставки":
                row("house", "Минск, пр. Победителей, 9 — кв. 12", "по умолчанию")
                row("shippingbox", "Пункт выдачи picPac, ул. Кальварийская, 25", "самовывоз")
            case "Уведомления о заказе":
                Toggle("Сообщать о каждом этапе заказа", isOn: $notify).font(.system(size: 16)).tint(Theme.ink)
                Text("Принят, печать, сборка, готов, в пути — те же этапы, что отмечает производство.").font(.system(size: 13.5)).foregroundStyle(Theme.ink3)
            case "Промокоды":
                VStack(alignment: .leading, spacing: 6) {
                    Text("PICPAC5").font(.system(size: 26, weight: .bold, design: .monospaced))
                    Text("−5 BYN на первый заказ от 30 BYN").font(.system(size: 14.5))
                }.padding(18).frame(maxWidth: .infinity, alignment: .leading).background(RoundedRectangle(cornerRadius: 20).fill(Theme.peach))
            case "Помощник Пак":
                Text("Пак здоровается один раз и уходит, если помощь не нужна. Позвать его можно мордочкой в правом нижнем углу.").font(.system(size: 15)).foregroundStyle(Theme.ink2)
                Button("Пусть снова поздоровается при запуске") { declinedDay = "" }.font(.system(size: 15.5, weight: .semibold)).foregroundStyle(Theme.ink)
            default:
                Text("picPac — приложение «Фотопринта». Каждый заказ проходит те же этапы, что видит руководитель в пульте компании: модерация, печать, сборка, контроль, доставка.").font(.system(size: 15)).foregroundStyle(Theme.ink2)
                Text("Версия 1.0 · демо для хакатона. Фото продуктов — Unsplash (лицензия Unsplash).").font(.system(size: 13)).foregroundStyle(Theme.ink3)
            }
            Spacer(minLength: 0)
        }
        .padding(20)
        .presentationDetents([.medium])
        .presentationCornerRadius(30)
        .presentationDragIndicator(.visible)
    }
    private func row(_ icon: String, _ t: String, _ s: String) -> some View {
        HStack(spacing: 12) { Image(systemName: icon).frame(width: 24); VStack(alignment: .leading, spacing: 2) { Text(t).font(.system(size: 15.5)); Text(s).font(.system(size: 13)).foregroundStyle(Theme.ink3) } }
            .padding(14).frame(maxWidth: .infinity, alignment: .leading).background(RoundedRectangle(cornerRadius: 18).fill(Theme.field))
    }
}
