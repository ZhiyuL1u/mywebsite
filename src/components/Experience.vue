<!-- 经历 -->

<template>
    <div class="content" id="experience">
        <ModuleHeader :title="experience.header.title" :sub-title="experience.header.subtitle"/>
        <a-timeline >
            <a-timeline-item color='white'  data-aos="fade-in" v-for="card in experience.cards" v-bind:key="card.title + card.subtitle">
                <a-card class="experience-card" :bodyStyle="{background:'#1e1f22'}" :bordered="false" style="width: 100%" :headStyle="{background:'#1e1f22'} ">

                        <h1 class="title" >{{card.title}}</h1>
                        <span v-if="!!card.subtitle" class="sub-title">{{card.subtitle}}</span>

                    <vue-markdown style="color: #bbbdc2;">{{card.md}}</vue-markdown>
                </a-card>
            </a-timeline-item>
        </a-timeline>
    </div>
</template>

<script lang="ts">
    import {Component, Vue} from 'vue-property-decorator';
    import ModuleHeader from '@/components/module/ModuleHeader.vue';
    import {Module} from '@/api/user_interface';
    // tslint:disable-next-line:no-var-requires
    import VueMarkdown from 'vue-markdown';

    @Component({
        components: {
            ModuleHeader,
            VueMarkdown,
        },
        computed: {
            experience(): Module {
                return this.$store.getters.getModule('experience');
            },
        },
    })
    export default class About extends Vue {
    }
</script>

<style scoped lang="scss">
    @import '../styles/variable';
    .ant-card >>> .ant-card-head{
      background: black;
    }



    .experience-card {



        .title {
          word-break: break-all;
            text-shadow: 0 0 5px rgba(255, 255, 255, 0.7);
            color: white;
            width: 100%;
            font-size: 1.2rem;
            overflow: scroll;
            margin: 0;

        }

        .sub-title {
          word-break: break-all;
          text-shadow: 0 0 5px rgba(255, 255, 255, 0.7);
            color: white;
            width: 100%;
            font-size: .8rem;
            display: block;
            margin-top: .5rem;
        }
    }
</style>
