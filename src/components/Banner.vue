<!-- 首屏banner -->

<template>
    <div class="banner" id="banner">
        <!-- 加载层 -->
        <div class="bg back"><h1>I'm using muscle power to speed up webpage loading...</h1></div>

        <!-- 背景层 -->
        <div data-aos="fade-in" class="bg"></div>
        <!-- 内容层 -->
        <div data-aos="fade-in" class="desc">
            <span class="avatar ant-avatar ant-avatar-circle ant-avatar-image">
                <img draggable="false" src="../assets/avatar.jpg">
            </span>
            <div>
              <h1>{{banner.title}}<span class="second-title-color">{{banner.secondTitle}}</span></h1>

              <h3 class="typer white" style="text-shadow: 0 0 1px #ffffff, 0 0 3px #e5e5e5, 0 0 2px #bdbdbd, 0 0 3px #4682B4;">
                    I'm
                    <vue-typer :text="banner.desc || 'Match_liu'" :type-delay='100' eraseStyle='select-all' style="text-shadow: 0 0 1px #ffffff, 0 0 3px #e5e5e5, 0 0 2px #bdbdbd, 0 0 3px #4682B4;"></vue-typer>
                </h3>
            </div>
        </div>
        <a data-aos="fade-in" class="scroll-next animated infinite bounce" href="#anchor-next" v-smooth-scroll>
            <a-icon type="double-right"/>
        </a>
    </div>
</template>

<script lang="ts">
    import {Component, Vue} from 'vue-property-decorator';
    import {mapGetters} from 'vuex';

    // tslint:disable-next-line:no-var-requires
    import {VueTyper} from 'vue-typer';

    @Component({
        components: {
            VueTyper,
            Badge: () => import('@/components/footer/Badge.vue'),
        },
        computed: {
            ...mapGetters(['banner']),
        },
    })
    export default class Banner extends Vue {
    }
</script>

<style scoped lang="scss">
    @import '../styles/variable';
    @import '../styles/fork';

    .banner {
        display: flex;
        position: relative;
        justify-content: center;
        align-items: center;
        width: 100vw;
        height: 100%;
        overflow-x: hidden;

        .bg {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            background: $--color-cyan url("../assets/bg_banner.jpg") no-repeat center center scroll;
            -webkit-background-size: cover;
            -moz-background-size: cover;
            -o-background-size: cover;
            background-size: cover;

            .back {
                z-index: -2;
            }

            h1 {
                display: block;
                margin-top: 45vh;
                color: $--font-color;
                font-size: 2em;
                text-shadow: 0 0 5px $--color-gray;
            }
        }

        .desc {
            margin-bottom: 20vh;

            * {

                margin: auto;
                color: $--font-color;
                text-shadow: 0 0 5px rgba(0, 0, 0, .5);
            }

            .avatar {
              display: block;
                z-index: -1;
                width: 160px;
                height: 160px;
                line-height: 160px;
                box-shadow: 0 0 10px rgba(0, 0, 0, .5);
            }
          .second-title-color {
            /* 设定渐变背景，从浅亮蓝色渐变到深亮蓝色 */
            background: linear-gradient(to bottom, #87CEFA, #4682B4); /* 浅天蓝到钢青色 */
            -webkit-background-clip: text;
            background-clip: text;
            color: transparent; /* 使文字颜色透明以显示背景渐变 */
            font-weight: bold; /* 字体加粗 */
            font-style: italic; /* 斜体 */
            /* 调整发光效果，减少模糊度 */
            text-shadow: 0 0 2px #a0d2fa, 0 0 4px #a4dafd, 0 0 2px #6399d0, 0 0 2px #5e8eb9;
            font-size: 1.5em;
            display: inline; /* 确保文本内联显示 */
          }






          h1 {
                font-size: 3em;
                margin: 1rem auto 1rem;
              font-weight: bold;
            display: inline;
            text-shadow: 0 0 2px #ffffff, 0 0 4px #e5e5e5, 0 0 2px #bdbdbd, 0 0 4px #4682B4;
            }

            h3 {
                font-size: 1.7em;

                .vue-typer {
                    display: inline-block;
                }
            }

            @media screen and (max-width: $--screen-sm-min) {
                h1 {
                    font-size: 2.3em;
                }

                h3 {
                    font-size: 1.3em;
                }
            }
        }

        .scroll-next {
            position: absolute;
            display: inline-block;
            width: 100%;
            padding: 2rem 0;
            bottom: 1vh;
            font-size: 1.5rem;
            color: $--font-color;
            animation-duration: 2s;
            animation-delay: 1s;

            * {
                transform: rotate(45deg);
            }
        }
    }
</style>
