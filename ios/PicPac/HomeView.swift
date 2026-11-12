import SwiftUI

/// Главная по образцу: приветствие, поиск с фильтром, чипы, «Продолжить» и «Популярное» — крупные фото-карточки.
struct HomeView: View {
    @EnvironmentObject var app: AppState
    private var name: String { app.userName }
    private func open(_ p: Product) { app.open(p) }
    @State private var category = "Все"
    @State private var showFilter = false

    private var shown: [Product] { category == "Все" ? Catalog.products : Catalog.products.filter { $0.category == category } }

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 22) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Привет, \(name)!").font(.system(size: 26, weight: .bold)).tracking(-0.6)
                        Text("Что напечатаем сегодня?").font(.system(size: 15)).foregroundStyle(Theme.ink3)
                    }
                    Spacer()
                    Button { app.showNotes = true } label: { RoundIcon(symbol: "bell", badge: app.unread > 0) }.buttonStyle(PressStyle(scale: 0.9))
                }

                Button { showFilter = true } label: {
                    HStack(spacing: 10) {
                        Image(systemName: "magnifyingglass").foregroundStyle(Theme.ink3)
                        Text("Фотокнига, печать 10×15…").foregroundStyle(Theme.ink4)
                        Spacer()
                        Image(systemName: "slider.horizontal.3").font(.system(size: 16, weight: .semibold)).foregroundStyle(Theme.ink)
                    }
                    .font(.system(size: 16)).padding(.horizontal, 16).frame(height: 52)
                    .background(Capsule().fill(Theme.field))
                }
                .buttonStyle(PressStyle(scale: 0.98))

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(Catalog.categories, id: \.self) { c in
                            Button { withAnimation(.spring(duration: 0.35)) { category = c } } label: { Chip(title: c, selected: category == c) }
                                .buttonStyle(PressStyle())
                        }
                    }.padding(.horizontal, 20)
                }.padding(.horizontal, -20)

                section("Продолжить", all: false) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 12) {
                            draftCard(Catalog.by("wedding"), chip: "Черновик", title: "Свадьба Ани и Миши", sub: "36 фото · сохранено вчера")
                            draftCard(Catalog.by("calendar"), chip: "Почти готово", title: "Календарь для мамы", sub: "11 из 12 месяцев")
                        }.padding(.horizontal, 20)
                    }.padding(.horizontal, -20)
                }

                section(category == "Все" ? "Популярное" : category) {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(alignment: .top, spacing: 14) {
                            ForEach(shown) { p in productCard(p) }
                        }.padding(.horizontal, 20)
                    }.padding(.horizontal, -20)
                }

                section("Почему picPac", all: false) {
                    VStack(alignment: .leading, spacing: 12) {
                        perk("checkmark.seal", "Бесплатная перепечатка, если нашли брак")
                        perk("creditcard", "Платите при получении — без предоплаты")
                        perk("icloud.and.arrow.up", "Черновик сохраняется сам, даже без сети")
                    }
                    .padding(18).frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 22).fill(Theme.peach))
                }
            }
            .padding(.horizontal, 20).padding(.top, 8).padding(.bottom, 120)
        }
        .sheet(isPresented: $showFilter) { FilterSheet(category: $category) }
    }

    private func section<C: View>(_ title: String, all: Bool = true, @ViewBuilder _ content: () -> C) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text(title).font(.system(size: 20, weight: .bold)).tracking(-0.4); Spacer()
                if all { Button { withAnimation(.spring(duration: 0.4)) { app.tab = .ideas } } label: { Text("Все").font(.system(size: 14, weight: .semibold)).foregroundStyle(Theme.ink3) } }
            }
            content()
        }
    }

    private func draftCard(_ p: Product, chip: String, title: String, sub: String) -> some View {
        Button { open(p) } label: {
            ZStack(alignment: .bottomLeading) {
                ProductArt(kind: p.kind, scene: p.scene, photo: p.photo)
                LinearGradient(colors: [.clear, .black.opacity(0.55)], startPoint: .center, endPoint: .bottom)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.system(size: 17, weight: .bold))
                    Text(sub).font(.system(size: 13))
                }.foregroundStyle(.white).padding(14)
                Text(chip).font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.ink)
                    .padding(.horizontal, 10).frame(height: 26).background(Capsule().fill(.white))
                    .padding(12).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            }
            .frame(width: 236, height: 170).clipShape(RoundedRectangle(cornerRadius: 22))
        }
        .buttonStyle(PressStyle(scale: 0.97))
    }

    private func productCard(_ p: Product) -> some View {
        Button { open(p) } label: {
            VStack(alignment: .leading, spacing: 6) {
                ProductArt(kind: p.kind, scene: p.scene, photo: p.photo)
                    .frame(width: 236, height: 196).clipShape(RoundedRectangle(cornerRadius: 22))
                    .overlay(alignment: .topTrailing) {
                        let on = app.liked.contains(p.id)
                        Button { withAnimation(.spring(duration: 0.3, bounce: 0.5)) { if on { app.liked.remove(p.id) } else { app.liked.insert(p.id) } } } label: {
                            Image(systemName: on ? "heart.fill" : "heart").font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(on ? Theme.red : Theme.ink).frame(width: 38, height: 38).background(Circle().fill(.white))
                                .scaleEffect(on ? 1.06 : 1)
                        }.buttonStyle(PressStyle(scale: 0.85)).padding(10)
                    }
                Text(p.name).font(.system(size: 16, weight: .bold)).foregroundStyle(Theme.ink).padding(.top, 4)
                HStack(spacing: 4) {
                    Image(systemName: "star.fill").foregroundStyle(Theme.star).font(.system(size: 12))
                    Text(String(format: "%.2f", p.rating).replacingOccurrences(of: ".", with: ",")).fontWeight(.semibold)
                    Text("(\(p.reviews) отзывов)").foregroundStyle(Theme.ink3)
                }.font(.system(size: 13)).foregroundStyle(Theme.ink)
                Text("Минск · доставка по Беларуси").font(.system(size: 13)).foregroundStyle(Theme.ink3)
                HStack(spacing: 6) { ForEach(p.tags, id: \.self) { Text($0).font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.ink2).padding(.horizontal, 8).frame(height: 24).background(Capsule().fill(Theme.chip)) } }
                HStack(spacing: 2) { Text("от " + money(p.price)).font(.system(size: 16, weight: .bold)); Text(p.unit).font(.system(size: 13)).foregroundStyle(Theme.ink3) }
                    .foregroundStyle(Theme.ink).padding(.top, 2)
            }
            .frame(width: 236, alignment: .leading)
        }
        .buttonStyle(PressStyle(scale: 0.97))
    }

    private func perk(_ icon: String, _ text: String) -> some View {
        HStack(spacing: 12) { Image(systemName: icon).font(.system(size: 17, weight: .semibold)).foregroundStyle(Theme.orange).frame(width: 24); Text(text).font(.system(size: 15)) }.foregroundStyle(Theme.ink)
    }
}
