<!-- 菜单 -->

<template>
    <a-layout class="layout-menu">
        <!-- 头像 -->
        <div class="header">
            <span class="avatar ant-avatar ant-avatar-circle ant-avatar-image">
                <img draggable="false" src="../assets/avatar.jpg">
            </span>
            <span>{{banner.name|| 'Match_liu'}}</span>
        </div>
        <!-- 菜单 -->
        <a-layout-content class="menu">
            <a-menu>
                <!-- 根据配置动态模块的内容和顺序 -->
                <a-menu-item v-for="m in menus" v-bind:key="m.id">
                    <a-icon :type="m.icon" />
                    <a v-smooth-scroll :href="'#' + m.id" @click="closeMenuDrawer">{{m.name}}</a>
                </a-menu-item>
              <a-menu-item key="extra">
                <a-icon type="read" />
                <a href="https://docs.google.com/document/d/1RFeWWVAKeMMWVPq2cO2tF8GpTyIL0-jy/edit?usp=sharing&ouid=111177539978422759112&rtpof=true&sd=true" target="_blank">Resume</a>
              </a-menu-item>
            </a-menu>

        </a-layout-content>
        <!-- 菜单页脚 -->
        <a-layout-footer class="footer">
            <!-- 社交 -->
            <a-row type="flex" justify="center" align="middle" :gutter="2">
                <a-col span="24"><Social color="rgb(200,200,200)" :size="1.2"/></a-col>
            </a-row>
            <!-- 版权 -->
            <a-row type="flex" justify="center" align="middle" :gutter="2">
                <a-col span="24"><Copyrights color="rgb(136,136,136)" :size=".6"/></a-col>
            </a-row>
        </a-layout-footer>
    </a-layout>
</template>

<script lang="ts">
    import {Component, Vue} from 'vue-property-decorator';
    import Copyrights from '@/components/footer/Copyrights.vue';
    import Social from '@/components/footer/Social.vue';
    import {mapGetters} from 'vuex';

    @Component({
        components: {
            Copyrights,
            Social,
        },
        computed: {
            ...mapGetters(['banner', 'menus']),
        },
    })
    export default class Menu extends Vue {
        private closeMenuDrawer() {
            this.$emit('menuClick');
        }
    }
</script>

<style scoped lang="scss">
    @import '../styles/variable';

    .layout-menu {
        width: 100%;
        height: 100vh;
        text-align: center;

        .header, .menu, .footer {
            background-color: #2b2d30 !important;
        }

        .header {
            margin: 2rem auto;
            .avatar {
                width: 80px;
                height: 80px;
                line-height: 80px;
            }
            span {
                display: block;
                margin-top: .5rem;
                font-size: 1.4em;
              font-weight: 700; /* 增加字体的粗细 */
              color: white; /* 设置字体颜色为白色 */
              text-shadow: 0 0 8px rgba(255, 255, 255, 0.8); /* 添加白色光晕效果 */

            }
        }

        .menu {
            * {
                font-size: 1em;

            }

            a {
                display: inline;

            }
        }

        .footer {
            padding: 10px;
            margin-bottom: 1rem;
            * {
                color: $--color-gray;
            }

            & > div {
                margin: .5rem auto;
            }
        }
    }
</style>
