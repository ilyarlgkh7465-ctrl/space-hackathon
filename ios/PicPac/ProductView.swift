import SwiftUI

/// Карточка продукта по образцу: фото во всю ширину, круглые кнопки поверх, белая шторка наезжает снизу.
struct ProductView: View {
    let product: Product
    @EnvironmentObject var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var variant = 1
    @State private var appeared = false
    private let variants = ["Lite", "Classic", "Premium"]

    var body: some View {
        ZStack(alignment: .bottom) {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    GeometryReader { g in
                        let y = g.frame(in: .global).minY
                        ProductArt(kind: product.kind, scene: product.scene, photo: product.photo)
                            .frame(width: g.size.width, height: 380 + max(0, y))
                            .offset(y: -max(0, y))                      // растягивается при оттягивании вниз
                            .scaleEffect(appeared ? 1 : 1.06)
                    }
                    .frame(height: 380)

                    VStack(alignment: .leading, spacing: 20) {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(product.name).font(.system(size: 24, weight: .bold)).tracking(-0.6)
                                Label("Минск · готово за 2–3 дня", systemImage: "mappin.and.ellipse").font(.system(size: 14)).foregroundStyle(Theme.ink3)
                            }
                            Spacer()
                            HStack(alignment: .firstTextBaseline, spacing: 1) {
                                Text(money(product.price)).font(.system(size: 19, weight: .bold))
                                Text(product.unit).font(.system(size: 13)).foregroundStyle(Theme.ink3)
                            }
                        }

                        HStack(spacing: 8) {
                            ForEach(["photo-album-chair", "photo-prints-hand", "photo-album-bw"], id: \.self) { n in
                                Color(Theme.chip).frame(height: 76).overlay(Image(uiImage: UIImage(named: n + ".jpg") ?? UIImage()).resizable().scaledToFill()).clipShape(RoundedRectangle(cornerRadius: 14))
                            }
                            ZStack { Color(Theme.chip).overlay(Image(uiImage: UIImage(named: "photo-album-old.jpg") ?? UIImage()).resizable().scaledToFill()); Color.black.opacity(0.45); Text("+12 идей").font(.system(size: 14, weight: .semibold)).foregroundStyle(.white) }
                                .frame(height: 76).clipShape(RoundedRectangle(cornerRadius: 14))
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Варианты").font(.system(size: 18, weight: .bold))
                            HStack(spacing: 8) {
                                ForEach(variants.indices, id: \.self) { i in
                                    Button { withAnimation(.spring(duration: 0.3)) { variant = i } } label: { Chip(title: variants[i], selected: variant == i) }.buttonStyle(PressStyle())
                                }
                            }
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Детали").font(.system(size: 18, weight: .bold))
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 8) {
                                ForEach(product.specs, id: \.1) { s in
                                    Label(s.1, systemImage: s.0).font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.ink2)
                                        .frame(maxWidth: .infinity, alignment: .leading).padding(.horizontal, 12).frame(height: 40)
                                        .background(Capsule().fill(Theme.chip))
                                }
                            }
                            Text(product.about).font(.system(size: 15)).foregroundStyle(Theme.ink2).lineSpacing(3)
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text("Оценка и отзывы").font(.system(size: 18, weight: .bold))
                            HStack(spacing: 6) {
                                Image(systemName: "star.fill").foregroundStyle(Theme.star)
                                Text(String(format: "%.2f", product.rating).replacingOccurrences(of: ".", with: ",")).font(.system(size: 22, weight: .bold))
                                Text("· \(product.reviews) отзывов").foregroundStyle(Theme.ink3)
                            }
                            VStack(alignment: .leading, spacing: 6) {
                                HStack { Text("Ольга К.").fontWeight(.semibold); Spacer(); HStack(spacing: 2) { ForEach(0..<5, id: \.self) { _ in Image(systemName: "star.fill").font(.system(size: 11)).foregroundStyle(Theme.star) } } }
                                Text("Заказывала альбом с выпускного — пришёл через два дня, цвета как на телефоне. Раскладку почти не правила.").foregroundStyle(Theme.ink2)
                            }
                            .font(.system(size: 14.5)).padding(14).background(RoundedRectangle(cornerRadius: 18).fill(Theme.field))
                        }
                    }
                    .padding(20).padding(.bottom, 110)
                    .background(UnevenRoundedRectangle(cornerRadii: .init(topLeading: 28, topTrailing: 28)).fill(.white))
                    .offset(y: -28)
                    .padding(.bottom, -28)
                    .offset(y: appeared ? 0 : 40).opacity(appeared ? 1 : 0)
                }
            }
            .ignoresSafeArea(edges: .top)

            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Итого").font(.system(size: 13)).foregroundStyle(Theme.ink3)
                    Text(money(product.price * [0.7, 1, 1.75][variant])).font(.system(size: 20, weight: .bold)).contentTransition(.numericText())
                }
                VStack(spacing: 4) {
                    Button { if app.photoCount > 0 { app.checkout = product } else { app.pickPhotos(for: .product(product)) } } label: {
                        PillButton(title: app.photoCount > 0 ? "Оформить · \(app.photoCount) фото" : "Выбрать фото")
                    }.buttonStyle(PressStyle())
                    if app.photoCount > 0 { Button("Выбрать другие фото") { app.pickPhotos(for: .product(product)) }.font(.system(size: 13, weight: .semibold)).foregroundStyle(Theme.ink3) }
                }
            }
            .padding(.horizontal, 20).padding(.top, 12)
            .background(.white.shadow(.drop(color: .black.opacity(0.06), radius: 10, y: -4)))
        }
        .overlay(alignment: .top) {
            HStack {
                Button { dismiss() } label: { RoundIcon(symbol: "chevron.left") }.buttonStyle(PressStyle(scale: 0.9))
                Spacer()
                let on = app.liked.contains(product.id)
                Button { withAnimation(.spring(duration: 0.3, bounce: 0.5)) { if on { app.liked.remove(product.id) } else { app.liked.insert(product.id) } } } label: {
                    Image(systemName: on ? "heart.fill" : "heart").font(.system(size: 16, weight: .semibold)).foregroundStyle(on ? Theme.red : Theme.ink)
                        .frame(width: 44, height: 44).background(Circle().fill(.white).shadow(color: .black.opacity(0.08), radius: 10, y: 4))
                }.buttonStyle(PressStyle(scale: 0.88))
                ShareLink(item: "picPac — \(product.name)") { RoundIcon(symbol: "square.and.arrow.up") }
            }
            .padding(.horizontal, 16)
        }
        .toolbar(.hidden, for: .navigationBar)
        .onAppear { withAnimation(.spring(duration: 0.55, bounce: 0.1)) { appeared = true } }
    }
}
